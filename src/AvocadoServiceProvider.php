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

class AvocadoServiceProvider extends AbstractServiceProvider
{
    /**
     * Individual files: [ dest relative to public/assets => src relative to extension root ]
     */
    private const BUNDLED_FILES = [
        'fire.webp' => 'resources/assets/fire.webp',
    ];

    /**
     * Whole directories: [ src dir relative to extension root => dest dir relative to public/assets ]
     */
    private const BUNDLED_DIRS = [
        'resources/assets/fonts' => 'fonts',
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
                @copy($src, $dest);
            }
        }

        // Directories — copy missing files or files updated in the extension
        foreach (self::BUNDLED_DIRS as $relSrcDir => $destSubDir) {
            $srcDir  = $extDir . '/' . $relSrcDir;
            $destDir = $assets . '/' . $destSubDir;
            if (! is_dir($srcDir)) {
                continue;
            }
            if (! is_dir($destDir)) {
                @mkdir($destDir, 0755, true);
            }
            foreach (new \DirectoryIterator($srcDir) as $file) {
                if ($file->isDot() || ! $file->isFile()) {
                    continue;
                }
                $dest = $destDir . '/' . $file->getFilename();
                if (! file_exists($dest) || $file->getMTime() > filemtime($dest)) {
                    @copy($file->getPathname(), $dest);
                }
            }
        }
    }
}
