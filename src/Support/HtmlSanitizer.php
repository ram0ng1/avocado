<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use DOMDocument;
use DOMElement;
use DOMXPath;

/**
 * Defense-in-depth HTML sanitizer for admin-paste fields (custom hero HTML,
 * loading-spinner HTML, etc.) that ultimately reach `m.trust()` / `innerHTML`
 * on the public site.
 *
 * Strips:
 *  - <script>, <iframe>, <object>, <embed>, <link>, <meta>, <base>, <form>
 *  - all on*= event-handler attributes
 *  - href / src / action / formaction / xlink:href pointing at
 *    javascript: / vbscript: / data:text/html schemes
 *  - inline style attributes containing expression(), @import, or *script: schemes
 *
 * Not a full allow-list (HTMLPurifier territory) — sized for "the admin pasted
 * markup we want to render, but XSS sinks should never reach guests".
 */
final class HtmlSanitizer
{
    private const STRIP_ELEMENTS = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'];

    private const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'background', 'poster'];

    private const DANGEROUS_SCHEME = '/^\s*(?:javascript|vbscript|data:text\/html)/i';

    private const DANGEROUS_STYLE = '/expression\s*\(|javascript:|vbscript:|@import/i';

    public static function sanitize(string $html): string
    {
        $trimmed = trim($html);
        if ($trimmed === '') {
            return '';
        }

        $dom = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);

        // Wrap with a root marker so we can serialize children without the wrapping
        // <html>/<body> shell that loadHTML adds.
        $wrapped = '<?xml encoding="UTF-8"?><div id="__avs_root__">' . $trimmed . '</div>';
        $loaded  = $dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded) {
            return '';
        }

        $xpath = new DOMXPath($dom);

        // 1. Drop dangerous elements entirely.
        $query = '//' . implode(' | //', self::STRIP_ELEMENTS);
        $nodes = $xpath->query($query);
        if ($nodes !== false) {
            foreach (iterator_to_array($nodes) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }

        // 2. Walk every remaining element, strip on* attrs and dangerous URLs/styles.
        $allEls = $xpath->query('//*');
        if ($allEls !== false) {
            foreach ($allEls as $el) {
                if (! $el instanceof DOMElement) {
                    continue;
                }
                self::scrubAttributes($el);
            }
        }

        // 3. Serialize children of the wrapper back out.
        $root = $dom->getElementById('__avs_root__');
        if ($root === null) {
            return '';
        }
        $out = '';
        foreach ($root->childNodes as $child) {
            $out .= $dom->saveHTML($child);
        }
        return $out;
    }

    private static function scrubAttributes(DOMElement $el): void
    {
        if ($el->attributes === null) {
            return;
        }
        // Snapshot attributes — removing while iterating breaks the live NodeList.
        foreach (iterator_to_array($el->attributes) as $attr) {
            $name  = strtolower($attr->nodeName);
            $value = (string) $attr->nodeValue;

            if (str_starts_with($name, 'on')) {
                $el->removeAttribute($attr->nodeName);
                continue;
            }

            if (in_array($name, self::URL_ATTRS, true) && preg_match(self::DANGEROUS_SCHEME, $value)) {
                $el->removeAttribute($attr->nodeName);
                continue;
            }

            if ($name === 'style' && preg_match(self::DANGEROUS_STYLE, $value)) {
                $el->removeAttribute($attr->nodeName);
            }
        }
    }
}
