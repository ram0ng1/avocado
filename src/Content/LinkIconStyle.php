<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Contracts\Filesystem\Factory;
use Psr\Http\Message\ServerRequestInterface;
use Ramon\Avocado\Support\SvgIconSanitizer;

/**
 * Ícone de link interno como variável CSS, em data URI: `mask-image` com URL de
 * outra origem exige CORS e quebraria com /assets numa CDN. Base64 não tem nada
 * que escape de `url("…")` nem do <style>.
 *
 * O <style> fica no cache junto do caminho; todo upload grava um nome novo,
 * então o caminho já serve de versão.
 */
class LinkIconStyle
{
    private const CACHE_KEY = 'avocado.link_icon_style.v1';

    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected Factory $filesystem,
        protected Cache $cache,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $path = trim((string) ($this->settings->get('avocado.link_icon_svg') ?? ''));

        if ($path === '') {
            return;
        }

        $cached = $this->cache->get(self::CACHE_KEY);

        if (is_array($cached) && ($cached['path'] ?? null) === $path && is_string($cached['uri'] ?? null)) {
            $uri = $cached['uri'];
        } else {
            $uri = $this->buildUri($path);

            if ($uri === null) {
                // Falha não vai para o cache: a próxima página tenta de novo.
                return;
            }

            $this->cache->forever(self::CACHE_KEY, ['path' => $path, 'uri' => $uri]);
        }

        $document->head[] = '<style id="avocado-link-icon">:root{--avocado-link-icon:url("' . $uri . '")}</style>';
        $document->head[] = '<script>document.documentElement.dataset.avocadoLinkIcon="true"</script>';
    }

    private function buildUri(string $path): ?string
    {
        $disk = $this->filesystem->disk('flarum-assets');

        if (!$disk->exists($path)) {
            return null;
        }

        // Sanitizado de novo: o disco é compartilhado e esta é a última barreira antes do CSS.
        $svg = SvgIconSanitizer::sanitize((string) $disk->get($path));

        if ($svg === null) {
            return null;
        }

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }
}
