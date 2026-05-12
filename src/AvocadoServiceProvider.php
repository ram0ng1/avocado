<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado;

use Flarum\Foundation\AbstractServiceProvider;
use Flarum\Foundation\Paths;
use Psr\Log\LoggerInterface;
use Throwable;

class AvocadoServiceProvider extends AbstractServiceProvider
{
    /**
     * Individual files: [ dest relative to public/assets => src relative to extension root ]
     */
    private const BUNDLED_FILES = [
        'fire.webp' => 'assets/fire.webp',
    ];

    /**
     * Whole directories: [ src dir relative to extension root => dest dir relative to public/assets ]
     */
    private const BUNDLED_DIRS = [
        'assets/fonts'             => 'fonts',
        // Async JS chunks — must be served from assets/js/{namespace}/{urlPath}.js
        // so that flarum.reg.chunkUrl() can locate them at runtime.
        'js/dist/forum/components' => 'js/ramon-avocado/forum/components',
    ];

    public function boot(): void
    {
        /** @var Paths $paths */
        $paths  = $this->container->make(Paths::class);
        $extDir = dirname(__DIR__);
        $assets = $paths->public . '/assets';

        // Individual files — copy if missing OR source is newer than destination
        foreach (self::BUNDLED_FILES as $destFile => $relSrc) {
            $src  = $extDir . '/' . $relSrc;
            $dest = $assets . '/' . $destFile;
            if (file_exists($src) && (! file_exists($dest) || filemtime($src) > filemtime($dest))) {
                $this->safeCopy($src, $dest);
            }
        }

        // Directories — copy missing files or files updated in the extension
        foreach (self::BUNDLED_DIRS as $relSrcDir => $destSubDir) {
            $srcDir  = $extDir . '/' . $relSrcDir;
            $destDir = $assets . '/' . $destSubDir;
            if (! is_dir($srcDir)) {
                continue;
            }
            if (! is_dir($destDir) && ! @mkdir($destDir, 0755, true) && ! is_dir($destDir)) {
                $this->logger()?->warning('[avocado] failed to create assets directory', [
                    'dir' => $destDir,
                ]);
                continue;
            }
            foreach (new \DirectoryIterator($srcDir) as $file) {
                if ($file->isDot() || ! $file->isFile()) {
                    continue;
                }
                $dest = $destDir . '/' . $file->getFilename();
                if (! file_exists($dest) || $file->getMTime() > filemtime($dest)) {
                    $this->safeCopy($file->getPathname(), $dest);
                }
            }
        }
    }

    /**
     * Copy with logging. Failures don't crash the request (assets being missing
     * degrades the UI but the forum still works), but they DO surface in the
     * Flarum log so silent 0-byte files can be diagnosed.
     */
    private function safeCopy(string $src, string $dest): void
    {
        try {
            if (! @copy($src, $dest)) {
                $err = error_get_last()['message'] ?? 'copy() returned false';
                $this->logger()?->warning('[avocado] asset copy failed', [
                    'src'   => $src,
                    'dest'  => $dest,
                    'error' => $err,
                ]);
            }
        } catch (Throwable $e) {
            $this->logger()?->warning('[avocado] asset copy threw', [
                'src'  => $src,
                'dest' => $dest,
                'ex'   => $e->getMessage(),
            ]);
        }
    }

    private function logger(): ?LoggerInterface
    {
        try {
            return $this->container->make(LoggerInterface::class);
        } catch (Throwable) {
            return null;
        }
    }
}
