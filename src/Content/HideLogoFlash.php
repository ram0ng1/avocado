<?php

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

    /** Teto do SVG embutido no HTML: acima disso fica no fetch do front, como antes. */
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
            // Set the data-attribute so html[data-avocado-logo-custom="true"] CSS rules
            // activate from the very first frame — before async CSS finishes loading.
            $document->head[] = '<script>document.documentElement.dataset.avocadoLogoCustom="true"</script>';
        }

        if ($hasSvgLogo) {
            // SVG logo: hide until JS fetches, crops via getBBox, injects, then reveals.
            $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';

            $inline = $this->inlineScript($logoPath);

            if ($inline !== null) {
                $document->head[] = $inline;
            }
        } elseif (!$avocadoEnabled && $flarumLogoPath !== '') {
            // Flarum default logo image: hide until the <img> fires its load event.
            // Without this the image appears at its natural (oversized) dimensions
            // for the duration of the first network fetch, then jumps to the CSS size.
            $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';
        }
    }

    /**
     * Logo já no primeiro paint, sem esperar o JS.
     *
     * O caminho antigo (que segue como fallback no forum/index.tsx) só mostrava
     * o header depois de o bundle subir, buscar o SVG e medir cada elemento com
     * getBBox para recortar o viewBox — tudo isso a cada página. O viewBox
     * recortado agora é medido uma vez no admin (Support\LogoViewBox) e o SVG
     * vem embutido aqui: o script abaixo troca o conteúdo do #home-link assim
     * que o parser passa pelo header, antes da primeira pintura.
     *
     * A troca repete passo a passo o que o front fazia — DOMParser em modo
     * `image/svg+xml`, clone, os mesmos atributos e estilos inline —, então o
     * resultado é o mesmo nó; e o parse em XML (não HTML) mantém a semântica de
     * segurança de antes: `<script>` vindo do DOMParser não executa e nada do
     * SVG passa pelo parser de HTML, onde uma tag de "breakout" (`<p>`, `<img>`)
     * sairia do contexto SVG.
     *
     * Sem viewBox gravado para ESTE arquivo (logo novo, admin ainda não abriu a
     * página), ou com o arquivo ilegível, não emite nada e o front segue o
     * caminho antigo.
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

        // Dentro de <script> o que importa é `<` (fecharia a tag ou abriria um
        // `<!--`): JSON_HEX_TAG resolve. Aspas não precisam de " — o JSON já
        // as escapa —, e o SVG tem muitas: escapar as duas quase dobrava o peso.
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

        // JSON_HEX_TAG troca `<`/`>` por </>: nenhum `</script>` fecha
        // a tag antes da hora, venha o que vier do arquivo ou do título.
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
