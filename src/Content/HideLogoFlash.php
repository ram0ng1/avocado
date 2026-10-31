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
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Psr\Http\Message\ServerRequestInterface;
use Ramon\Avocado\Support\LogoViewBox;

class HideLogoFlash
{
    /** Cache do SVG cru do logo, junto do caminho que o gerou. */
    private const SVG_CACHE_KEY = 'avocado.logo_svg_inline.v1';

    /** Teto do SVG embutido no HTML; acima disso o front busca o arquivo. */
    private const MAX_INLINE_BYTES = 65536;

    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected FilesystemFactory $filesystem,
        protected Cache $cache,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $avocadoEnabled = (bool) $this->settings->get('avocado.logo_enabled', false);
        $logoPath       = trim((string) ($this->settings->get('avocado.logo_svg') ?? ''));
        $hasSvgLogo     = $avocadoEnabled && $logoPath !== '';
        $flarumLogoPath = trim((string) ($this->settings->get('logo_path') ?? ''));

        if ($avocadoEnabled) {
            // O atributo liga as regras do logo já no primeiro quadro.
            $document->head[] = '<script>document.documentElement.dataset.avocadoLogoCustom="true"</script>';
        }

        if ($hasSvgLogo) {
            $this->svgLogoOptions($document);

            // Escondido até o JS buscar, recortar e injetar o SVG.
            $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';

            $inline = $this->inlineScript($logoPath);

            if ($inline !== null) {
                $document->head[] = $inline;
            }
        } elseif (!$avocadoEnabled && $flarumLogoPath !== '') {
            // Escondido até o load do <img>: antes disso ele aparece no tamanho natural.
            $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';
        }
    }

    /**
     * Cor e ajuste vertical do logo SVG no <head>, senão o logo piscaria na cor do
     * arquivo até o CSS chegar. Usa --header-color: no "cabeçalho colorido" a cor
     * primária sumiria sobre o fundo.
     */
    private function svgLogoOptions(Document $document): void
    {
        $script = '';
        $style  = '';

        if ((bool) $this->settings->get('avocado.logo_colored', false)) {
            $coloredHeader = (bool) $this->settings->get('theme_colored_header', false);
            $primary       = trim((string) ($this->settings->get('theme_primary_color') ?? ''));
            $fallback      = $coloredHeader || !preg_match('/^#[0-9a-f]{3,8}$/i', $primary) ? 'currentColor' : $primary;

            $script .= 'document.documentElement.dataset.avocadoLogoColored="true";';
            $style  .= 'html[data-avocado-logo-colored="true"] #home-link svg.Header-logo *{fill:var(--header-color,'.$fallback.')!important}'
                .'html[data-avocado-logo-colored="true"] #home-link svg.Header-logo [fill="none"]{fill:none!important}';
        }

        $offset = max(-30, min(30, (int) $this->settings->get('avocado.logo_offset_y', 0)));

        if ($offset !== 0) {
            $script .= 'document.documentElement.style.setProperty("--avocado-logo-offset-y","'.$offset.'px");';
            $style  .= '#home-link svg.Header-logo{transform:translateY(var(--avocado-logo-offset-y,0px))}';
        }

        if ($script !== '') {
            $document->head[] = '<script>'.$script.'</script>';
            $document->head[] = '<style>'.$style.'</style>';
        }
    }

    /**
     * Logo embutido já no primeiro paint, com o viewBox medido no admin
     * (Support\LogoViewBox). O parse é em XML (`image/svg+xml`): `<script>` não
     * executa e nada do SVG passa pelo parser de HTML, onde poderia sair do contexto SVG.
     * Sem viewBox para este arquivo, não emite nada e o front mede sozinho.
     */
    private function inlineScript(string $logoPath): ?string
    {
        $viewBox = LogoViewBox::forPath((string) ($this->settings->get(LogoViewBox::SETTING) ?? ''), $logoPath);

        if ($viewBox === null) {
            return null;
        }

        $svg = $this->svg($logoPath);

        if ($svg === null) {
            return null;
        }

        // Dentro de <script> o perigo é `<`, que JSON_HEX_TAG resolve. Aspas o JSON já
        // escapa, e escapá-las de novo quase dobraria o peso do SVG.
        $flags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE;
        $data = json_encode([
            's' => $svg,
            'v' => $viewBox,
            // Mesmo valor de app.forum.attribute('title') usado pelo front.
            't' => (string) ($this->settings->get('forum_title') ?? ''),
        ], $flags);

        if ($data === false) {
            return null;
        }

        // JSON_HEX_TAG: nenhum `</script>` do arquivo ou do título fecha a tag.
        return '<script id="avocado-logo-inline">(function(){var d='.$data.';'
            .'function go(){var a=document.getElementById("home-link");if(!a||a.querySelector("svg.AvocadoLogoSvg"))return;'
            .'var e=new DOMParser().parseFromString(d.s,"image/svg+xml").documentElement;if(e.nodeName!=="svg")return;'
            .'var o=e.cloneNode(true),p=d.v.split(" "),w=parseFloat(p[2]),h=parseFloat(p[3]),W=50;'
            .'o.setAttribute("viewBox",d.v);if(w>0&&h>0)W=Math.round(50*w/h);'
            .'o.setAttribute("width",String(W));o.setAttribute("height","50");o.setAttribute("class","Header-logo AvocadoLogoSvg");'
            .'o.setAttribute("role","img");o.setAttribute("aria-label",d.t||"");o.style.display="block";o.style.margin="0 auto";'
            .'a.textContent="";a.style.display="flex";a.style.alignItems="center";a.style.justifyContent="center";a.appendChild(o);'
            .'a.style.visibility="";var x=document.getElementById("avocado-logo-hide");if(x)x.remove()}'
            // #header-primary vem logo depois do #home-link no layout do core:
            // quando ele existe, o link já está inteiro no DOM.
            .'var m=new MutationObserver(function(){if(document.getElementById("header-primary")){m.disconnect();go()}});'
            .'m.observe(document.documentElement,{childList:true,subtree:true});'
            .'document.addEventListener("DOMContentLoaded",function(){m.disconnect();go()})})()</script>';
    }

    /** SVG do disco, em cache pelo caminho (o upload sempre grava um nome novo). */
    private function svg(string $logoPath): ?string
    {
        $cached = $this->cache->get(self::SVG_CACHE_KEY);

        if (is_array($cached) && ($cached['path'] ?? null) === $logoPath && is_string($cached['svg'] ?? null)) {
            return $cached['svg'];
        }

        $disk = $this->filesystem->disk('flarum-assets');

        try {
            $svg = $disk->exists($logoPath) ? (string) $disk->get($logoPath) : '';
        } catch (\Throwable) {
            return null;
        }

        // Falha não entra no cache: o próximo request tenta de novo.
        if ($svg === '' || strlen($svg) > self::MAX_INLINE_BYTES) {
            return null;
        }

        $this->cache->forever(self::SVG_CACHE_KEY, ['path' => $logoPath, 'svg' => $svg]);

        return $svg;
    }
}
