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

    /** Private/reserved IP ranges — blocked to prevent SSRF. */
    private const BLOCKED_PREFIXES = [
        '10.', '192.168.', '169.254.',  // RFC-1918 / link-local
        '127.',                          // loopback
        '0.',                            // IANA reserved
        '::1', 'fc00:', 'fe80:',         // IPv6 loopback / ULA / link-local
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

        $this->validateImageUrl($url);

        $cacheKey  = $this->cacheKey($url, $width, $height, $format, $quality);
        $cachePath = $this->cacheDir . '/' . $cacheKey;

        if (file_exists($cachePath)) {
            return $this->streamFile($cachePath, $this->mimeType($format));
        }

        if (!is_dir($this->cacheDir)) {
            mkdir($this->cacheDir, 0750, true);
        }

        $tmpPath     = $this->download($url);
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
     * SSL verification is enabled; TLS errors will surface as exceptions.
     */
    private function download(string $url): string
    {
        try {
            $client   = new Client(['timeout' => 30, 'verify' => true]);
            $response = $client->get($url, ['stream' => true]);

            if ($response->getStatusCode() !== 200) {
                throw new RuntimeException('Remote server returned ' . $response->getStatusCode());
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
     * Validate a URL before fetching it.
     *
     * Blocks:
     *  - Non-HTTP(S) schemes
     *  - Private / loopback / link-local IP ranges (SSRF prevention)
     *  - Bare `localhost` hostnames
     */
    private function validateImageUrl(string $url): void
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

        // Block bare localhost names
        if ($host === 'localhost' || $host === 'localhost.') {
            throw new InvalidRequestException('Requests to localhost are not allowed.');
        }

        // Resolve the hostname to an IP and check against blocked ranges
        $ip = gethostbyname($host);
        foreach (self::BLOCKED_PREFIXES as $prefix) {
            if (str_starts_with($ip, $prefix) || str_starts_with($host, $prefix)) {
                throw new InvalidRequestException('Requests to private or reserved IP ranges are not allowed.');
            }
        }
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
