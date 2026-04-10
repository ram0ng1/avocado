<?php

namespace Ramon\Avocado\Controller;

use Flarum\Http\Controller\AbstractController;
use Flarum\Http\Exception\InvalidRequestException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Laminas\Diactoros\Response;
use Laminas\Diactoros\Stream;
use RuntimeException;
use Exception;

/**
 * OptimizeImageController - Dynamic image optimization server
 * 
 * Converts GIFs to MP4/WebM, creates responsive images, optimizes formats
 * Similar to WhatsApp's image delivery optimization
 * 
 * Usage:
 *   /api/avocado/optimize-image?url=[encoded-url]&width=400&height=150&format=webp
 */
class OptimizeImageController extends AbstractController
{
    // Cache directory for optimized images
    private const CACHE_DIR = 'storage/avocado-image-cache';
    
    // Supported output formats
    private const FORMATS = ['webp', 'avif', 'mp4', 'webm', 'jpeg'];
    
    // Max file size to process (50MB)
    private const MAX_SIZE = 52428800;
    
    // GIF to video conversion threshold
    private const GIF_TO_VIDEO_SIZE = 500000; // 500KB

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        try {
            $queryParams = $request->getQueryParams();
            $imageUrl = $queryParams['url'] ?? null;
            $width = (int)($queryParams['width'] ?? 0);
            $height = (int)($queryParams['height'] ?? 0);
            $format = $queryParams['format'] ?? 'webp';
            $quality = (int)($queryParams['quality'] ?? 80);

            if (!$imageUrl) {
                throw new InvalidRequestException('Missing required parameter: url');
            }

            if (!in_array($format, self::FORMATS)) {
                throw new InvalidRequestException(sprintf('Unsupported format: %s', $format));
            }

            // Validate URL (prevent SSRF)
            $this->validateImageUrl($imageUrl);

            // Generate cache key
            $cacheKey = $this->generateCacheKey($imageUrl, $width, $height, $format, $quality);
            $cachePath = self::CACHE_DIR . '/' . $cacheKey;

            // Return cached if exists
            if (file_exists($cachePath)) {
                return $this->streamFile($cachePath, $this->getMimeType($format));
            }

            // Ensure cache directory exists
            @mkdir(self::CACHE_DIR, 0755, true);

            // Download original image
            $originalPath = $this->downloadImage($imageUrl);
            $originalMime = mime_content_type($originalPath);

            // Process based on source type
            if (in_array($originalMime, ['image/gif', 'video/mp4', 'video/webm'])) {
                $outputPath = $this->convertGifToVideo($originalPath, $format);
            } else {
                $outputPath = $this->optimizeImage(
                    $originalPath,
                    $width,
                    $height,
                    $format,
                    $quality
                );
            }

            // Move to cache
            rename($outputPath, $cachePath);
            
            // Cleanup original
            @unlink($originalPath);

            return $this->streamFile($cachePath, $this->getMimeType($format));

        } catch (Exception $e) {
            throw new InvalidRequestException($e->getMessage());
        }
    }

    /**
     * Download image from URL with validation
     */
    private function downloadImage(string $url): string
    {
        try {
            $client = new Client(['timeout' => 30, 'verify' => false]);
            $response = $client->get($url, ['stream' => true]);

            if ($response->getStatusCode() !== 200) {
                throw new RuntimeException('Failed to download image');
            }

            // Check size
            $size = (int)($response->getHeader('Content-Length')[0] ?? 0);
            if ($size > self::MAX_SIZE) {
                throw new RuntimeException('Image too large');
            }

            $tmpPath = tempnam(sys_get_temp_dir(), 'avocado_img_');
            $stream = fopen($tmpPath, 'w');
            
            foreach ($response->getBody() as $chunk) {
                fwrite($stream, $chunk);
            }
            fclose($stream);

            return $tmpPath;
        } catch (GuzzleException $e) {
            throw new RuntimeException('Failed to download image: ' . $e->getMessage());
        }
    }

    /**
     * Convert GIF to MP4/WebM video
     */
    private function convertGifToVideo(string $gifPath, string $format): string
    {
        $outputPath = tempnam(sys_get_temp_dir(), 'avocado_vid_');
        $outputPath = str_replace('.tmp', '.' . ($format === 'webm' ? 'webm' : 'mp4'), $outputPath);

        // FFmpeg command to convert GIF to video
        if ($format === 'webm') {
            $cmd = sprintf(
                'ffmpeg -i %s -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -f webm %s 2>/dev/null',
                escapeshellarg($gifPath),
                escapeshellarg($outputPath)
            );
        } else {
            // MP4 with H.264
            $cmd = sprintf(
                'ffmpeg -i %s -c:v libx264 -pix_fmt yuv420p -preset fast -crf 28 %s 2>/dev/null',
                escapeshellarg($gifPath),
                escapeshellarg($outputPath)
            );
        }

        exec($cmd, $output, $returnCode);
        
        if ($returnCode !== 0 || !file_exists($outputPath)) {
            throw new RuntimeException('Failed to convert GIF to video');
        }

        return $outputPath;
    }

    /**
     * Optimize image: resize, convert format, compress
     */
    private function optimizeImage(
        string $imagePath,
        int $width,
        int $height,
        string $format,
        int $quality
    ): string {
        // Use ImageMagick via shell (most compatible)
        $outputPath = tempnam(sys_get_temp_dir(), 'avocado_img_');
        $outputPath .= '.' . $format;

        $resizeArg = '';
        if ($width > 0 && $height > 0) {
            // Fit within bounds, maintain aspect ratio
            $resizeArg = sprintf('-resize %dx%d', $width, $height);
        }

        // Build convert command
        if ($format === 'webp') {
            $cmd = sprintf(
                'convert %s %s -quality %d -strip %s 2>/dev/null',
                escapeshellarg($imagePath),
                $resizeArg,
                $quality,
                escapeshellarg($outputPath)
            );
        } elseif ($format === 'avif') {
            // Use ImageMagick for AVIF
            $cmd = sprintf(
                'convert %s %s -quality %d -strip %s 2>/dev/null',
                escapeshellarg($imagePath),
                $resizeArg,
                $quality,
                escapeshellarg($outputPath)
            );
        } else {
            // JPEG fallback
            $cmd = sprintf(
                'convert %s %s -quality %d -strip %s 2>/dev/null',
                escapeshellarg($imagePath),
                $resizeArg,
                $quality,
                escapeshellarg($outputPath)
            );
        }

        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0 || !file_exists($outputPath)) {
            throw new RuntimeException('Failed to optimize image');
        }

        return $outputPath;
    }

    /**
     * Validate image URL (prevent SSRF)
     */
    private function validateImageUrl(string $url): void
    {
        // Parse URL
        $parsed = parse_url($url);
        
        if (!$parsed || empty($parsed['host'])) {
            throw new RuntimeException('Invalid image URL');
        }

        // Check scheme
        if (!in_array($parsed['scheme'] ?? 'https', ['http', 'https'])) {
            throw new RuntimeException('Invalid URL scheme');
        }
    }

    /**
     * Generate cache key from image parameters
     */
    private function generateCacheKey(
        string $url,
        int $width,
        int $height,
        string $format,
        int $quality
    ): string {
        $key = sprintf(
            '%s_%d_%d_%s_q%d',
            md5($url),
            $width,
            $height,
            $format,
            $quality
        );
        return $key . '.' . $format;
    }

    /**
     * Get MIME type for format
     */
    private function getMimeType(string $format): string
    {
        return match ($format) {
            'webp' => 'image/webp',
            'avif' => 'image/avif',
            'mp4' => 'video/mp4',
            'webm' => 'video/webm',
            default => 'image/jpeg',
        };
    }

    /**
     * Stream file to client
     */
    private function streamFile(string $filePath, string $mimeType): ResponseInterface
    {
        if (!file_exists($filePath)) {
            throw new RuntimeException('Optimized file not found');
        }

        $stream = new Stream(fopen($filePath, 'r'));
        
        return (new Response($stream, 200))
            ->withHeader('Content-Type', $mimeType)
            ->withHeader('Cache-Control', 'public, max-age=31536000')
            ->withHeader('Content-Length', (string) filesize($filePath))
            ->withHeader('Content-Disposition', 'inline');
    }
}
