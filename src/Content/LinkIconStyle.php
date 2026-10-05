<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Cache\Repository as Cache;
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
 *
 * O <style> pronto fica no cache do Flarum, junto do caminho que o gerou: este
 * content roda em toda página, e sem o cache cada uma pagava exists() + get() no
 * disco e o parse do sanitizador. O upload grava o arquivo com nome novo
 * (sufixo aleatório) e o delete zera a setting, então o caminho já é a versão —
 * trocou o ícone, o caminho não bate e a próxima página refaz.
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
                // Falha (arquivo sumiu, SVG recusado) não vai para o cache: a
                // próxima página tenta de novo, como antes.
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

        // Sanitizado de novo na saída: o arquivo foi limpo no upload, mas o disco
        // é compartilhado e esta é a última barreira antes de virar CSS.
        $svg = SvgIconSanitizer::sanitize((string) $disk->get($path));

        if ($svg === null) {
            return null;
        }

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }
}
