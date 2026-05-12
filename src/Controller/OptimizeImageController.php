<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Foundation\Paths;
use Flarum\Http\Controller\AbstractController;
use Flarum\Http\Exception\InvalidRequestException;
use Flarum\Http\RequestUtil;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Laminas\Diactoros\Response;
use Laminas\Diactoros\Stream;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;
use Symfony\Component\HttpFoundation\IpUtils;

/**
 * OptimizeImageController — Dynamic image optimization proxy (admin-only).
 *
 * Converts GIFs to MP4/WebM, resizes images, and converts to modern formats
 * (WebP/AVIF). Only accessible by administrators.
 *
 * Usage:
 *   GET /api/avocado/optimize-image?url=<encoded>&width=400&height=150&format=webp
 */
class OptimizeImageController extends AbstractController
{
    private const FORMATS = ['webp', 'avif', 'mp4', 'webm', 'jpeg'];
    private const MAX_SIZE = 52_428_800; // 50 MB

    /** Allowed MIME types for image inputs. */
    private const ALLOWED_MIMES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'image/avif', 'video/mp4', 'video/webm',
    ];

    /**
     * CIDR-based SSRF block-list. Matched with Symfony\IpUtils::checkIp, so
     * each entry is a proper CIDR rather than a string prefix.
     *
     * Covers: this-host, loopback, link-local, RFC-1918, CGNAT, benchmarking,
     * documentation, multicast, future-use, broadcast.
     */
    private const BLOCKED_CIDRS_V4 = [
        '0.0.0.0/8',         // current network ("this host")
        '10.0.0.0/8',        // RFC-1918
        '100.64.0.0/10',     // CGNAT (RFC-6598)
        '127.0.0.0/8',       // loopback
        '169.254.0.0/16',    // link-local / cloud metadata (AWS, Alibaba)
        '172.16.0.0/12',     // RFC-1918
        '192.0.0.0/24',      // IETF protocol assignments
        '192.0.2.0/24',      // documentation (TEST-NET-1)
        '192.168.0.0/16',    // RFC-1918
        '198.18.0.0/15',     // benchmarking
        '198.51.100.0/24',   // documentation (TEST-NET-2)
        '203.0.113.0/24',    // documentation (TEST-NET-3)
        '224.0.0.0/4',       // multicast
        '240.0.0.0/4',       // reserved for future use
        '255.255.255.255/32', // broadcast
    ];

    /**
     * IPv6 equivalents. Notably includes ::ffff:0:0/96 so IPv4-mapped IPv6
     * literals (e.g. ::ffff:127.0.0.1) cannot bypass the v4 block-list, plus
     * NAT64 (64:ff9b::/96) which translates v6 to v4 transparently.
     */
    private const BLOCKED_CIDRS_V6 = [
        '::/128',         // unspecified
        '::1/128',         // loopback
        '::ffff:0:0/96',   // IPv4-mapped IPv6
        '64:ff9b::/96',    // NAT64
        '100::/64',        // discard prefix
        'fc00::/7',        // unique local (ULA)
        'fe80::/10',       // link-local
        'ff00::/8',        // multicast
    ];

    private string $cacheDir;

    public function __construct(Paths $paths)
    {
        $this->cacheDir = $paths->storage . '/avocado-image-cache';
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        // ── Auth: admin only ────────────────────────────────────────────────
        RequestUtil::getActor($request)->assertAdmin();

        $params  = $request->getQueryParams();
        $url     = $params['url']     ?? null;
        $width   = (int) ($params['width']   ?? 0);
        $height  = (int) ($params['height']  ?? 0);
        $format  = $params['format']  ?? 'webp';
        $quality = max(1, min(100, (int) ($params['quality'] ?? 80)));

        if (!$url) {
            throw new InvalidRequestException('Missing required parameter: url');
        }

        if (!in_array($format, self::FORMATS, true)) {
            throw new InvalidRequestException('Unsupported format: ' . $format);
        }

        // Validate once and pin the resolved IP — we'll pass it to the HTTP client
        // so DNS rebinding (TOCTOU between validator and connector) cannot redirect
        // the fetch to a private address.
        $pinnedIp = $this->validateImageUrl($url);

        $cacheKey  = $this->cacheKey($url, $width, $height, $format, $quality);
        $cachePath = $this->cacheDir . '/' . $cacheKey;

        if (file_exists($cachePath)) {
            return $this->streamFile($cachePath, $this->mimeType($format));
        }

        if (!is_dir($this->cacheDir)) {
            mkdir($this->cacheDir, 0750, true);
        }

        $tmpPath     = $this->download($url, $pinnedIp);
        $contentMime = mime_content_type($tmpPath) ?: '';

        if (!in_array($contentMime, self::ALLOWED_MIMES, true)) {
            @unlink($tmpPath);
            throw new InvalidRequestException('URL does not point to a supported image or video.');
        }

        try {
            if (in_array($contentMime, ['image/gif', 'video/mp4', 'video/webm'], true)) {
                $outPath = $this->gifToVideo($tmpPath, $format);
            } else {
                $outPath = $this->optimizeImage($tmpPath, $width, $height, $format, $quality);
            }

            rename($outPath, $cachePath);
        } finally {
            @unlink($tmpPath);
        }

        return $this->streamFile($cachePath, $this->mimeType($format));
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Download the remote image to a temp file.
     *
     * SSL verification is enabled; TLS errors surface as exceptions.
     * Redirects are NOT followed (a redirect to 169.254.169.254 would bypass
     * the URL-time validator). The pinned IP from validateImageUrl is forced
     * onto the cURL handle so the actual TCP connection cannot be redirected
     * by a DNS rebinding attack between validation and fetch.
     */
    private function download(string $url, string $pinnedIp): string
    {
        try {
            $parsed = parse_url($url);
            $host   = strtolower((string) ($parsed['host'] ?? ''));
            $hostForResolve = trim($host, '[]');
            $port   = (int) ($parsed['port'] ?? (($parsed['scheme'] ?? 'http') === 'https' ? 443 : 80));

            $client = new Client([
                'timeout'         => 30,
                'verify'          => true,
                'allow_redirects' => false,
                'curl'            => [
                    CURLOPT_RESOLVE => ["$hostForResolve:$port:$pinnedIp"],
                ],
            ]);
            $response = $client->get($url, ['stream' => true]);

            $code = $response->getStatusCode();
            if ($code >= 300 && $code < 400) {
                throw new InvalidRequestException('Redirects are not followed for security.');
            }
            if ($code !== 200) {
                throw new RuntimeException('Remote server returned ' . $code);
            }

            $contentLength = (int) ($response->getHeader('Content-Length')[0] ?? 0);
            if ($contentLength > self::MAX_SIZE) {
                throw new RuntimeException('Image exceeds the 50 MB size limit.');
            }

            $tmp    = tempnam(sys_get_temp_dir(), 'avocado_img_');
            $stream = fopen($tmp, 'wb');
            $total  = 0;

            foreach ($response->getBody() as $chunk) {
                $total += strlen($chunk);
                if ($total > self::MAX_SIZE) {
                    fclose($stream);
                    @unlink($tmp);
                    throw new RuntimeException('Image exceeds the 50 MB size limit.');
                }
                fwrite($stream, $chunk);
            }

            fclose($stream);

            return $tmp;
        } catch (GuzzleException $e) {
            throw new RuntimeException('Download failed: ' . $e->getMessage(), 0, $e);
        }
    }

    /** Convert GIF/video to MP4 or WebM using FFmpeg. */
    private function gifToVideo(string $src, string $format): string
    {
        $ext = $format === 'webm' ? 'webm' : 'mp4';
        $out = tempnam(sys_get_temp_dir(), 'avocado_vid_') . '.' . $ext;

        if ($format === 'webm') {
            $cmd = sprintf(
                'ffmpeg -i %s -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -f webm %s 2>/dev/null',
                escapeshellarg($src),
                escapeshellarg($out)
            );
        } else {
            $cmd = sprintf(
                'ffmpeg -i %s -c:v libx264 -pix_fmt yuv420p -preset fast -crf 28 %s 2>/dev/null',
                escapeshellarg($src),
                escapeshellarg($out)
            );
        }

        exec($cmd, $output, $code);

        if ($code !== 0 || !file_exists($out)) {
            throw new RuntimeException('FFmpeg conversion failed.');
        }

        return $out;
    }

    /** Resize and convert a static image using ImageMagick. */
    private function optimizeImage(
        string $src,
        int $width,
        int $height,
        string $format,
        int $quality
    ): string {
        $out       = tempnam(sys_get_temp_dir(), 'avocado_img_') . '.' . $format;
        $resizeArg = ($width > 0 && $height > 0)
            ? sprintf('-resize %dx%d', $width, $height)
            : '';

        $cmd = sprintf(
            'convert %s %s -quality %d -strip %s 2>/dev/null',
            escapeshellarg($src),
            $resizeArg,
            $quality,
            escapeshellarg($out)
        );

        exec($cmd, $output, $code);

        if ($code !== 0 || !file_exists($out)) {
            throw new RuntimeException('ImageMagick conversion failed.');
        }

        return $out;
    }

    /**
     * Validate a URL before fetching it. Returns the resolved IP that the
     * caller MUST pin onto the HTTP client (CURLOPT_RESOLVE) — otherwise a
     * DNS rebinding attack can swap the IP between validation and connect.
     *
     * Blocks:
     *  - Non-HTTP(S) schemes
     *  - Bare `localhost` hostnames
     *  - Hosts that resolve to private / loopback / link-local / metadata IPs
     *  - IPv6 IPv4-mapped literals that proxy onto v4 ranges
     *  - All A/AAAA records — if ANY resolves to a blocked range, the host is rejected
     */
    private function validateImageUrl(string $url): string
    {
        $parsed = parse_url($url);

        if (!$parsed || empty($parsed['host'])) {
            throw new InvalidRequestException('Invalid image URL.');
        }

        $scheme = strtolower($parsed['scheme'] ?? '');
        if (!in_array($scheme, ['http', 'https'], true)) {
            throw new InvalidRequestException('Only http and https URLs are allowed.');
        }

        $host = strtolower($parsed['host']);
        // IPv6 hosts arrive bracket-wrapped from parse_url; strip for IP checks.
        $hostForCheck = trim($host, '[]');

        // Block bare localhost names (and trailing-dot variant).
        if (in_array($hostForCheck, ['localhost', 'localhost.'], true)) {
            throw new InvalidRequestException('Requests to localhost are not allowed.');
        }

        // Reject numeric-form IPv4 (gethostbyname returns the literal back unchanged).
        if (preg_match('/^\d+$/', $hostForCheck) || preg_match('/^0x[0-9a-f]+$/i', $hostForCheck)) {
            throw new InvalidRequestException('Numeric host literals are not allowed.');
        }

        // Collect every IP this host could resolve to; reject if ANY is blocked.
        $ips = [];
        if (filter_var($hostForCheck, FILTER_VALIDATE_IP) !== false) {
            $ips[] = $hostForCheck;
        } else {
            $a    = @dns_get_record($hostForCheck, DNS_A)    ?: [];
            $aaaa = @dns_get_record($hostForCheck, DNS_AAAA) ?: [];
            foreach (array_merge($a, $aaaa) as $rec) {
                $ip = $rec['ip'] ?? $rec['ipv6'] ?? null;
                if (is_string($ip) && $ip !== '') {
                    $ips[] = $ip;
                }
            }
        }

        if (empty($ips)) {
            throw new InvalidRequestException('Could not resolve host.');
        }

        foreach ($ips as $ip) {
            $isV6  = str_contains($ip, ':');
            $cidrs = $isV6 ? self::BLOCKED_CIDRS_V6 : self::BLOCKED_CIDRS_V4;
            if (IpUtils::checkIp($ip, $cidrs)) {
                throw new InvalidRequestException('Requests to private or reserved IP ranges are not allowed.');
            }
        }

        // Pin the first resolved IP; the caller forces this onto the HTTP client.
        return $ips[0];
    }

    private function cacheKey(
        string $url,
        int $width,
        int $height,
        string $format,
        int $quality
    ): string {
        return sprintf('%s_%d_%d_%s_q%d.%s', md5($url), $width, $height, $format, $quality, $format);
    }

    private function mimeType(string $format): string
    {
        return match ($format) {
            'webp'  => 'image/webp',
            'avif'  => 'image/avif',
            'mp4'   => 'video/mp4',
            'webm'  => 'video/webm',
            default => 'image/jpeg',
        };
    }

    private function streamFile(string $path, string $mime): ResponseInterface
    {
        if (!file_exists($path)) {
            throw new RuntimeException('Cached file not found.');
        }

        return (new Response(new Stream(fopen($path, 'rb')), 200))
            ->withHeader('Content-Type', $mime)
            ->withHeader('Cache-Control', 'public, max-age=31536000, immutable')
            ->withHeader('Content-Length', (string) filesize($path))
            ->withHeader('Content-Disposition', 'inline');
    }
}
