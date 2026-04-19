<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Makes ALL Flarum-generated CSS non-render-blocking.
 *
 * Strategy:
 *  1. A tiny inline <script> runs synchronously in <head>, AFTER all <link> tags
 *     have been emitted by Flarum, and converts EVERY CSS <link> whose href is in
 *     the /assets/ path (i.e., all Flarum-compiled CSS — core + every extension)
 *     to use rel="preload" + onload so the browser doesn't block the first paint.
 *  2. A <noscript> fallback ensures the stylesheet is still loaded for
 *     JavaScript-disabled clients.
 *
 * The critical above-the-fold CSS (font-face, body reset, header dimensions,
 * hero reservation, mobile nav) is already injected inline by AddCriticalCss,
 * so the page looks correct from the very first frame even before any async CSS
 * arrives. Deferring ALL /assets/ CSS eliminates the render-blocking that was
 * holding FCP back to ~1.9 s — the browser can now paint at TTFB + parse time
 * (~400–600 ms) instead of waiting for every stylesheet to download.
 *
 * NOTE: This script is placed at the END of <head> (appended last) so it runs
 * after all <link> tags have been written to the DOM by Flarum's template engine.
 */
class DeferMainCss
{
    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        // language=JavaScript
        $script = <<<'JS'
(function(){
  var links = document.querySelectorAll('link[rel="stylesheet"]');
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    var href = link.getAttribute('href') || '';
    // Defer every Flarum-generated stylesheet (all reside under /assets/).
    // Non-asset links (e.g. third-party <link> without /assets/) are left alone.
    if (href.indexOf('/assets/') === -1) continue;
    var noscript = document.createElement('noscript');
    var fallback = document.createElement('link');
    fallback.rel = 'stylesheet';
    fallback.href = href;
    noscript.appendChild(fallback);
    link.parentNode.insertBefore(noscript, link.nextSibling);
    link.rel = 'preload';
    link.as = 'style';
    link.onload = function() { this.onload = null; this.rel = 'stylesheet'; };
  }
})();
JS;

        $script = trim($script);

        $document->head[] = '<script id="avocado-defer-css">' . $script . '</script>';
    }
}
