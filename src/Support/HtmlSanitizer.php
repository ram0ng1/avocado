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
 *  - <script>, <style>, <iframe>, <object>, <embed>, <link>, <meta>, <base>, <form>
 *  - all on*= event-handler attributes
 *  - href / src / action / formaction / xlink:href pointing at
 *    javascript: / vbscript: / data:text/html schemes
 *  - inline style attributes containing expression(), @import, or *script: schemes
 *
 * <style> is stripped because admin-pasted CSS reaches every guest via
 * serializeToForum and can carry @import url(evil) / expression() payloads
 * (the inline-style scrub only covers style="..." attributes, not <style>
 * element bodies).
 *
 * Not a full allow-list (HTMLPurifier territory) — sized for "the admin pasted
 * markup we want to render, but XSS sinks should never reach guests".
 */
final class HtmlSanitizer
{
    // <noscript> and <template> change the HTML parser's context: their bodies
    // are re-parsed by the browser in a way DOMDocument doesn't replicate, which
    // is a classic mutation-XSS (mXSS) vector. They have no legitimate use in an
    // admin "paste some markup" field, so drop them outright.
    private const STRIP_ELEMENTS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'noscript', 'template'];

    private const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'background', 'poster'];

    private const DANGEROUS_SCHEME = '/^\s*(?:javascript|vbscript|data:text\/html)/i';

    private const DANGEROUS_STYLE = '/expression\s*\(|javascript:|vbscript:|@import/i';

    /**
     * Upper bound on the parse→scrub→serialize passes (see sanitize()). Clean
     * markup converges in two passes; the cap stops a pathological input from
     * looping forever.
     */
    private const MAX_PASSES = 5;

    public static function sanitize(string $html): string
    {
        $trimmed = trim($html);
        if ($trimmed === '') {
            return '';
        }

        // mXSS defense-in-depth: a denylist scrub can leave markup that, once the
        // browser re-parses our serialized output, mutates into a different (and
        // dangerous) tree than DOMDocument saw. Re-run the scrub until the
        // serialization stops changing, so any node that only becomes dangerous
        // after a parse→serialize round trip is caught on the next pass. Normal
        // input stabilizes after the first (normalizing) pass.
        $current = $trimmed;
        for ($i = 0; $i < self::MAX_PASSES; $i++) {
            $next = self::scrubOnce($current);
            if ($next === $current) {
                return $next;
            }
            $current = $next;
        }

        return $current;
    }

    private static function scrubOnce(string $trimmed): string
    {
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

        // 1. Drop comment nodes. Conditional comments and `<!-- --><script>`-style
        //    constructs are an mXSS vector, and comments never carry rendered
        //    content an admin needs in this field.
        $comments = $xpath->query('//comment()');
        if ($comments !== false) {
            foreach (iterator_to_array($comments) as $comment) {
                $comment->parentNode?->removeChild($comment);
            }
        }

        // 2. Drop dangerous elements entirely.
        $query = '//' . implode(' | //', self::STRIP_ELEMENTS);
        $nodes = $xpath->query($query);
        if ($nodes !== false) {
            foreach (iterator_to_array($nodes) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }

        // 3. Walk every remaining element, strip on* attrs and dangerous URLs/styles.
        $allEls = $xpath->query('//*');
        if ($allEls !== false) {
            foreach ($allEls as $el) {
                if (! $el instanceof DOMElement) {
                    continue;
                }
                self::scrubAttributes($el);
            }
        }

        // 4. Serialize children of the wrapper back out.
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
