<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Makes the extension's compiled CSS non-render-blocking.
 *
 * Strategy:
 *  1. A tiny inline <script> runs synchronously in <head>, AFTER all <link> tags
 *     have been emitted by Flarum, and converts every CSS <link> that belongs to
 *     this extension (identified by "ramon-avocado" in the href) to use
 *     rel="preload" + onload so the browser doesn't block the first paint on it.
 *  2. A <noscript> fallback ensures the stylesheet is still loaded for
 *     JavaScript-disabled clients.
 *
 * The critical above-the-fold CSS (font-face, body reset, header dimensions) is
 * already injected inline by AddCriticalCss, so the page looks correct from the
 * very first frame even before the main CSS arrives.
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
            // Only defer Avocado's own stylesheet(s) — leave Flarum core CSS alone.
            if (href.indexOf('ramon-avocado') === -1) continue;
            // Build a <noscript> fallback before we modify the link.
            var noscript = document.createElement('noscript');
            var fallback = document.createElement('link');
            fallback.rel = 'stylesheet';
            fallback.href = href;
            noscript.appendChild(fallback);
            link.parentNode.insertBefore(noscript, link.nextSibling);
            // Convert to preload so it loads in parallel without blocking render.
            link.rel = 'preload';
            link.as  = 'style';
            link.onload = function() { this.onload = null; this.rel = 'stylesheet'; };
          }
        })();
        JS;

        // Strip heredoc indentation
        $script = preg_replace('/^        /m', '', trim($script));

        $document->head[] = '<script id="avocado-defer-css">' . $script . '</script>';
    }
}
