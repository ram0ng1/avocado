<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Filesystem\Factory;
use Psr\Http\Message\ServerRequestInterface;
use Ramon\Avocado\Support\SvgIconSanitizer;

/**
 * Entrega o ícone de link interno (admin → Logo) como variável CSS.
 *
 * O SVG vai embutido como data URI, e não como URL do asset: `mask-image` com
 * URL de outra origem exige CORS, e um fórum que serve /assets por CDN ficaria
 * sem ícone nenhum. Embutido também não pisca nem custa uma requisição. Base64
 * só tem caracteres seguros dentro de `url("…")`, então nada escapa do <style>.
 *
 * O atributo no <html> é o que liga as regras de forum/UrlLink.less — sem ele o
 * rótulo segue com o favicon, como no core.
 */
class LinkIconStyle
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected Factory $filesystem,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $path = trim((string) ($this->settings->get('avocado.link_icon_svg') ?? ''));

        if ($path === '') {
            return;
        }

        $disk = $this->filesystem->disk('flarum-assets');

        if (!$disk->exists($path)) {
            return;
        }

        // Sanitizado de novo na saída: o arquivo foi limpo no upload, mas o disco
        // é compartilhado e esta é a última barreira antes de virar CSS.
        $svg = SvgIconSanitizer::sanitize((string) $disk->get($path));

        if ($svg === null) {
            return;
        }

        $uri = 'data:image/svg+xml;base64,' . base64_encode($svg);

        $document->head[] = '<style id="avocado-link-icon">:root{--avocado-link-icon:url("' . $uri . '")}</style>';
        $document->head[] = '<script>document.documentElement.dataset.avocadoLinkIcon="true"</script>';
    }
}
