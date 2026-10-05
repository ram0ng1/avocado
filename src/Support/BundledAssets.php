<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Flarum\Foundation\Paths;
use Illuminate\Filesystem\Filesystem;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Copia para public/assets os arquivos que o tema serve por URL fixa (as fontes
 * referenciadas pelo LESS e o fire.webp).
 *
 * Antes isso rodava no boot do service provider em TODO request: um stat por
 * entrada para montar a assinatura + a leitura do marcador. Com PHP-FPM o memo
 * estático não sobrevive entre requests, então o custo era permanente. Agora a
 * sincronização acompanha o ciclo de vida dos assets do próprio core — o Flarum
 * recompila os dele em `Enabled`, `Disabled` e `ClearingCache` (Forum/Admin
 * ServiceProvider), e é o mesmo `cache:clear` que todo update por composer já
 * exige para o forum.js novo chegar. O boot só confere se o marcador existe (um
 * stat), para o caso de um public/assets novo em folha.
 *
 * Os chunks lazy (js/dist/forum/components) NÃO entram aqui: o
 * `->jsDirectory()` do extend.php já os publica em
 * assets/js/ramon-avocado/forum/components quando o core recompila os assets —
 * conferido apagando um chunk, rodando `cache:clear` e pedindo uma página.
 */
class BundledAssets
{
    /** [destino relativo a public/assets => origem relativa à raiz da extensão] */
    private const FILES = [
        'fire.webp' => 'assets/fire.webp',
    ];

    /** [diretório de origem relativo à extensão => destino relativo a public/assets] */
    private const DIRS = [
        'assets/fonts' => 'fonts',
    ];

    /** Marcador em public/assets; o conteúdo é a assinatura da última cópia. */
    public const MARKER = '.avocado-sync';

    public function __construct(
        protected Filesystem $files,
        protected Paths $paths,
        protected ?LoggerInterface $logger = null,
    ) {
    }

    /** Caminho do marcador — o boot só faz um is_file() nele. */
    public function markerPath(): string
    {
        return $this->paths->public.'/assets/'.self::MARKER;
    }

    /**
     * Sincroniza quando a assinatura das origens difere do marcador (ou quando
     * `$force`, no cache:clear): copia o que falta ou o que ficou mais novo na
     * extensão. O marcador é gravado por último, então uma cópia que quebre no
     * meio é refeita na próxima vez.
     */
    public function sync(bool $force = false): void
    {
        $extDir = dirname(__DIR__, 2);
        $assets = $this->paths->public.'/assets';
        $signature = $this->signature($extDir);
        $markerPath = $this->markerPath();

        if (! $force) {
            try {
                if (trim($this->files->get($markerPath)) === $signature) {
                    return;
                }
            } catch (Throwable) {
                // Marcador ausente ou ilegível — segue para a cópia.
            }
        }

        foreach (self::FILES as $destFile => $relSrc) {
            $src = $extDir.'/'.$relSrc;
            $dest = $assets.'/'.$destFile;
            if ($this->files->exists($src) && (! $this->files->exists($dest) || $this->files->lastModified($src) > $this->files->lastModified($dest))) {
                $this->safeCopy($src, $dest);
            }
        }

        foreach (self::DIRS as $relSrcDir => $destSubDir) {
            $srcDir = $extDir.'/'.$relSrcDir;
            $destDir = $assets.'/'.$destSubDir;
            if (! $this->files->isDirectory($srcDir)) {
                continue;
            }
            if (! $this->files->isDirectory($destDir)) {
                // `force` engole o warning do mkdir; quem diz se deu certo é o
                // is_dir logo abaixo (cobre também a corrida com outro request).
                $this->files->makeDirectory($destDir, 0755, true, true);
                clearstatcache(true, $destDir);

                if (! is_dir($destDir)) {
                    $this->logger?->warning('[avocado] failed to create assets directory', ['dir' => $destDir]);
                    continue;
                }
            }
            foreach ($this->files->files($srcDir) as $file) {
                $dest = $destDir.'/'.$file->getFilename();
                if (! $this->files->exists($dest) || $file->getMTime() > $this->files->lastModified($dest)) {
                    $this->safeCopy($file->getPathname(), $dest);
                }
            }
        }

        try {
            $this->files->put($markerPath, $signature);
        } catch (Throwable $e) {
            $this->logger?->warning('[avocado] failed to write sync marker', [
                'path' => $markerPath,
                'ex'   => $e->getMessage(),
            ]);
        }
    }

    /**
     * Hash dos mtimes de cada entrada de origem. O mtime do diretório muda quando
     * um arquivo entra, sai ou é renomeado — o bastante para um update.
     */
    private function signature(string $extDir): string
    {
        $parts = [];
        foreach (self::FILES as $relSrc) {
            $src = $extDir.'/'.$relSrc;
            $parts[] = $relSrc.':'.($this->files->exists($src) ? $this->files->lastModified($src) : '0');
        }
        foreach (array_keys(self::DIRS) as $relSrcDir) {
            $src = $extDir.'/'.$relSrcDir;
            $parts[] = $relSrcDir.':'.($this->files->isDirectory($src) ? $this->files->lastModified($src) : '0');
        }

        return hash('xxh64', implode('|', $parts));
    }

    /**
     * Falha de cópia não derruba o request (asset faltando degrada a UI, o fórum
     * segue), mas vai para o log do Flarum para um arquivo de 0 byte ter pista.
     */
    private function safeCopy(string $src, string $dest): void
    {
        try {
            if (! $this->files->copy($src, $dest)) {
                $this->logger?->warning('[avocado] asset copy failed', ['src' => $src, 'dest' => $dest]);
            }
        } catch (Throwable $e) {
            $this->logger?->warning('[avocado] asset copy threw', ['src' => $src, 'dest' => $dest, 'ex' => $e->getMessage()]);
        }
    }
}
