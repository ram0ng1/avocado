<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Illuminate\Contracts\Filesystem\Cloud;
use Illuminate\Contracts\Filesystem\Factory;

/**
 * Fonte única das URLs da DM Sans.
 *
 * A @font-face (CSS crítico inline) e o `<link rel="preload">` precisam pedir
 * EXATAMENTE a mesma URL — senão o navegador baixa o arquivo duas vezes. Antes
 * havia uma segunda declaração em less/common/fonts.less com caminho relativo à
 * raiz (`/assets/fonts/…`), que divergia da URL absoluta do preload em instalação
 * em subpasta, CDN de assets ou host diferente do configurado. Agora as duas
 * saem daqui, do disco `flarum-assets` — o mesmo que o core usa para as fontes
 * do Font Awesome.
 */
final class ThemeFonts
{
    public const NORMAL = 'fonts/dm-sans-variable.woff2';

    public const ITALIC = 'fonts/dm-sans-italic.woff2';

    public function __construct(protected Factory $filesystem) {}

    public function url(string $file): string
    {
        // O disco de assets é sempre um Cloud (local ou remoto) — o core também o
        // trata assim (`$assetsDir->url()` nos compiladores de assets).
        /** @var Cloud $disk */
        $disk = $this->filesystem->disk('flarum-assets');

        return $disk->url($file);
    }
}
