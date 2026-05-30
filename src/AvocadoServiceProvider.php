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
use Flarum\Frontend\Frontend;
use Illuminate\Filesystem\Filesystem;
use Psr\Log\LoggerInterface;
use Ramon\Avocado\Controller\TeamPageController;
use Throwable;

class AvocadoServiceProvider extends AbstractServiceProvider
{
    /**
     * Asset-directory paths whose sync we've already verified in THIS process.
     * Under persistent workers (Octane/Swoole) and test suites the provider
     * boots many times; once a signature matches we can skip the filesystem
     * round-trip entirely for the rest of the process lifetime.
     *
     * @var array<string, string> assets-dir => verified signature
     */
    private static array $verifiedSignatures = [];

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

    /** Marker filename stored under public/assets; content is a hash of source mtimes. */
    private const SYNC_MARKER = '.avocado-sync';

    public function register(): void
    {
        // Supply TeamPageController with the *forum* Frontend without forcing it
        // to inject the container and resolve the 'flarum.frontend.forum' string
        // itself. Resolving that binding also runs the content-callback wiring
        // registered via Extend\Frontend('forum'), so the page renders identically.
        $this->container->when(TeamPageController::class)
            ->needs(Frontend::class)
            ->give(fn () => $this->container->make('flarum.frontend.forum'));
    }

    public function boot(Filesystem $files): void
    {
        /** @var Paths $paths */
        $paths  = $this->container->make(Paths::class);
        $extDir = dirname(__DIR__);
        $assets = $paths->public.'/assets';

        // Build a cheap signature from the source-side mtimes (one stat per
        // top-level entry — N is < 10 in practice). When admin/composer updates
        // the extension, the bundled-dir mtimes change and the marker mismatches,
        // forcing a fresh sync.
        $signature = $this->buildSignature($files, $extDir);

        // In-process fast-path: once a signature is verified, every later boot in
        // the same process (persistent workers, test suites) skips all I/O below.
        if ((self::$verifiedSignatures[$assets] ?? null) === $signature) {
            return;
        }

        // Steady-state cost on the first boot of a process is N source stats (for
        // the signature) + one marker read. We read the marker directly and catch
        // the not-found case rather than paying an extra exists() stat first.
        $markerPath = $assets.'/'.self::SYNC_MARKER;
        try {
            if (trim($files->get($markerPath)) === $signature) {
                self::$verifiedSignatures[$assets] = $signature;
                return;
            }
        } catch (Throwable) {
            // Marker missing or unreadable — fall through and (re)sync.
        }

        // Individual files — copy if missing OR source is newer than destination.
        foreach (self::BUNDLED_FILES as $destFile => $relSrc) {
            $src  = $extDir.'/'.$relSrc;
            $dest = $assets.'/'.$destFile;
            if ($files->exists($src) && (! $files->exists($dest) || $files->lastModified($src) > $files->lastModified($dest))) {
                $this->safeCopy($files, $src, $dest);
            }
        }

        // Directories — copy missing files or files updated in the extension.
        foreach (self::BUNDLED_DIRS as $relSrcDir => $destSubDir) {
            $srcDir  = $extDir.'/'.$relSrcDir;
            $destDir = $assets.'/'.$destSubDir;
            if (! $files->isDirectory($srcDir)) {
                continue;
            }
            if (! $files->isDirectory($destDir) && ! $files->makeDirectory($destDir, 0755, true) && ! $files->isDirectory($destDir)) {
                $this->logger()?->warning('[avocado] failed to create assets directory', [
                    'dir' => $destDir,
                ]);
                continue;
            }
            foreach ($files->files($srcDir) as $file) {
                $dest = $destDir.'/'.$file->getFilename();
                if (! $files->exists($dest) || $file->getMTime() > $files->lastModified($dest)) {
                    $this->safeCopy($files, $file->getPathname(), $dest);
                }
            }
        }

        // Touch the marker last so a sync that crashes halfway is retried.
        try {
            $files->put($markerPath, $signature);
            self::$verifiedSignatures[$assets] = $signature;
        } catch (Throwable $e) {
            $this->logger()?->warning('[avocado] failed to write sync marker', [
                'path' => $markerPath,
                'ex'   => $e->getMessage(),
            ]);
        }
    }

    /**
     * Hash the source-side mtimes of every top-level bundled entry. Two boots
     * with the same signature can safely skip the per-file sync.
     */
    private function buildSignature(Filesystem $files, string $extDir): string
    {
        $parts = [];
        foreach (self::BUNDLED_FILES as $relSrc) {
            $src = $extDir.'/'.$relSrc;
            $parts[] = $relSrc.':'.($files->exists($src) ? $files->lastModified($src) : '0');
        }
        foreach (array_keys(self::BUNDLED_DIRS) as $relSrcDir) {
            $src = $extDir.'/'.$relSrcDir;
            // Directory mtime changes when files inside are added/removed/renamed
            // — sufficient for detecting composer/admin-driven extension updates.
            $parts[] = $relSrcDir.':'.($files->isDirectory($src) ? $files->lastModified($src) : '0');
        }

        return hash('xxh64', implode('|', $parts));
    }

    /**
     * Copy with logging. Failures don't crash the request (assets being missing
     * degrades the UI but the forum still works), but they DO surface in the
     * Flarum log so silent 0-byte files can be diagnosed.
     */
    private function safeCopy(Filesystem $files, string $src, string $dest): void
    {
        try {
            if (! $files->copy($src, $dest)) {
                $this->logger()?->warning('[avocado] asset copy failed', [
                    'src'  => $src,
                    'dest' => $dest,
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
