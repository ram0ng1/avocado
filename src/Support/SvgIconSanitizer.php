<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use DOMAttr;
use DOMCdataSection;
use DOMComment;
use DOMDocument;
use DOMDocumentType;
use DOMElement;
use DOMProcessingInstruction;
use DOMXPath;

/**
 * Turns an admin-supplied SVG into markup that is safe to inline on every page.
 *
 * - Only a fixed set of SVG elements survives; everything else (script,
 *   foreignObject, editor metadata, ...) is dropped along with its children.
 * - Event handlers, external references and executable URLs are removed.
 * - Ids and class names get a per-icon suffix, so several icons that all
 *   ship an `id="a"` gradient or a `.st0` class do not clash on one page.
 * - fill/stroke set through `<style>` rules or `style=""` are moved onto
 *   presentation attributes, which lets the stylesheet override them with
 *   the current text colour when the tag asks for a monochrome icon.
 * - The root loses its fixed width/height (a viewBox is derived when
 *   missing), so CSS can size the icon like a font glyph.
 */
final class SvgIconSanitizer
{
    public const MAX_BYTES = 102400;

    private const SVG_NS = 'http://www.w3.org/2000/svg';
    private const XLINK_NS = 'http://www.w3.org/1999/xlink';
    private const XML_NS = 'http://www.w3.org/XML/1998/namespace';

    private const ALLOWED_ELEMENTS = [
        'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'switch',
        'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
        'text', 'tspan', 'textPath',
        'linearGradient', 'radialGradient', 'stop',
        'clipPath', 'mask', 'pattern', 'marker', 'image', 'style',
        'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
        'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
        'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
        'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
        'feOffset', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
    ];

    /** CSS that can pull in outside resources or run code. */
    private const DANGEROUS_CSS = '/@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding|url\s*\(\s*["\']?\s*[^#"\'\s)]/i';

    /**
     * Returns the cleaned SVG markup, or null when the input is not a usable SVG.
     */
    public static function sanitize(string $svg): ?string
    {
        $svg = trim((string) preg_replace('/^\xEF\xBB\xBF/', '', $svg));

        if ($svg === '' || strlen($svg) > self::MAX_BYTES) {
            return null;
        }

        // No prolog, no DOCTYPE: nothing may declare entities.
        $svg = (string) preg_replace('/<\?xml[^>]*\?>/i', '', $svg);
        $svg = (string) preg_replace('/<!DOCTYPE[^\[>]*(\[.*?\])?\s*>/is', '', $svg);

        if (stripos($svg, '<!ENTITY') !== false) {
            return null;
        }

        $svg = trim($svg);
        $dom = self::load($svg);

        // A snippet pasted without its namespace declarations is common; add
        // them and try once more.
        if (! $dom && ! preg_match('/<svg[^>]*\sxmlns=/i', $svg)) {
            $dom = self::load((string) preg_replace(
                '/<svg\b/i',
                '<svg xmlns="'.self::SVG_NS.'" xmlns:xlink="'.self::XLINK_NS.'"',
                $svg,
                1
            ));
        }

        if (! $dom || ! $dom->documentElement) {
            return null;
        }

        $root = $dom->documentElement;

        if ($root->localName !== 'svg') {
            return null;
        }

        self::clean($root);
        self::hoistStyleRules($dom, $root);
        self::hoistInlineStyles($dom);
        self::normalizeRoot($root);
        self::scopeIdentifiers($dom, $svg);

        $out = $dom->saveXML($root);

        return $out === false ? null : $out;
    }

    private static function load(string $svg): ?DOMDocument
    {
        $previous = libxml_use_internal_errors(true);

        $dom = new DOMDocument('1.0', 'UTF-8');
        $loaded = $dom->loadXML($svg, LIBXML_NONET | LIBXML_NOCDATA);

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return $loaded ? $dom : null;
    }

    private static function clean(DOMElement $element): void
    {
        self::cleanAttributes($element);

        foreach (iterator_to_array($element->childNodes) as $child) {
            if ($child instanceof DOMComment
                || $child instanceof DOMProcessingInstruction
                || $child instanceof DOMDocumentType) {
                $element->removeChild($child);
                continue;
            }

            if (! $child instanceof DOMElement) {
                continue;
            }

            if (! self::isAllowedElement($child)) {
                $element->removeChild($child);
                continue;
            }

            if ($child->localName === 'style' && preg_match(self::DANGEROUS_CSS, $child->textContent)) {
                $element->removeChild($child);
                continue;
            }

            self::clean($child);
        }
    }

    private static function isAllowedElement(DOMElement $element): bool
    {
        $ns = $element->namespaceURI;

        return ($ns === null || $ns === self::SVG_NS)
            && in_array($element->localName, self::ALLOWED_ELEMENTS, true);
    }

    private static function cleanAttributes(DOMElement $element): void
    {
        /** @var DOMAttr $attr */
        foreach (iterator_to_array($element->attributes) as $attr) {
            $name = strtolower($attr->nodeName);
            $value = trim($attr->value);
            $ns = $attr->namespaceURI;

            $remove = str_starts_with($name, 'on')
                || ($ns !== null && ! in_array($ns, [self::SVG_NS, self::XLINK_NS, self::XML_NS], true))
                || ($attr->localName === 'href' && ! self::isSafeHref($value))
                || ($name === 'style' && preg_match(self::DANGEROUS_CSS, $value))
                || ($name !== 'style' && preg_match('/javascript:|data:text\/html|vbscript:/i', (string) preg_replace('/\s+/', '', $value)));

            if ($remove) {
                $element->removeAttributeNode($attr);
            }
        }
    }

    private static function isSafeHref(string $value): bool
    {
        return $value === ''
            || str_starts_with($value, '#')
            || (bool) preg_match('#^data:image/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$#i', $value);
    }

    /**
     * Moves `fill`/`stroke` out of `style=""` onto attributes. Inline style
     * outranks any class rule, so this runs after hoistStyleRules and simply
     * overwrites what that pass set.
     */
    private static function hoistInlineStyles(DOMDocument $dom): void
    {
        $xpath = new DOMXPath($dom);

        foreach ($xpath->query('//*[@style]') as $element) {
            /** @var DOMElement $element */
            self::hoistInlineStyle($element);
        }
    }

    private static function hoistInlineStyle(DOMElement $element): void
    {
        if (! $element->hasAttribute('style')) {
            return;
        }

        $style = $element->getAttribute('style');

        foreach (['fill', 'stroke'] as $property) {
            if (preg_match('/(?:^|;)\s*'.$property.'\s*:\s*([^;]+)/i', $style, $m)) {
                $element->setAttribute($property, trim($m[1]));
                $style = (string) preg_replace('/(^|;)\s*'.$property.'\s*:\s*[^;]+;?/i', '$1', $style);
            }
        }

        $style = trim($style, " \t\n\r;");

        if ($style === '') {
            $element->removeAttribute('style');
        } else {
            $element->setAttribute('style', $style);
        }
    }

    /**
     * Applies `fill`/`stroke` from simple `.class { ... }` rules in <style>
     * elements (the shape Illustrator and friends export) as presentation
     * attributes, and strips those declarations from the rule.
     */
    private static function hoistStyleRules(DOMDocument $dom, DOMElement $root): void
    {
        $xpath = new DOMXPath($dom);

        foreach (iterator_to_array($xpath->query('//*[local-name()="style"]')) as $styleElement) {
            /** @var DOMElement $styleElement */
            $css = $styleElement->textContent;

            $css = preg_replace_callback('/([^{}]+)\{([^{}]*)\}/', function ($rule) use ($xpath, $root) {
                $selectors = array_map('trim', explode(',', $rule[1]));
                $declarations = $rule[2];

                $simpleClasses = [];
                foreach ($selectors as $selector) {
                    if (! preg_match('/^\.(-?[_a-zA-Z][\w-]*)$/', $selector, $m)) {
                        return $rule[0];
                    }
                    $simpleClasses[] = $m[1];
                }

                foreach (['fill', 'stroke'] as $property) {
                    if (! preg_match('/(?:^|;)\s*'.$property.'\s*:\s*([^;]+)/i', $declarations, $m)) {
                        continue;
                    }

                    $value = trim(str_ireplace('!important', '', $m[1]));

                    foreach ($simpleClasses as $class) {
                        $nodes = $xpath->query(
                            './/*[contains(concat(" ", normalize-space(@class), " "), " '.$class.' ")]',
                            $root
                        );
                        foreach ($nodes as $node) {
                            /** @var DOMElement $node */
                            $node->setAttribute($property, $value);
                        }
                    }

                    $declarations = (string) preg_replace('/(^|;)\s*'.$property.'\s*:\s*[^;]+;?/i', '$1', $declarations);
                }

                return $rule[1].'{'.$declarations.'}';
            }, $css);

            self::setStyleText($styleElement, (string) $css);
        }
    }

    private static function setStyleText(DOMElement $styleElement, string $css): void
    {
        while ($styleElement->firstChild) {
            $styleElement->removeChild($styleElement->firstChild);
        }

        // CDATA keeps `>` and `&` literal once the markup is inlined in HTML.
        $styleElement->appendChild(new DOMCdataSection(str_replace(']]>', ']]]]><![CDATA[>', $css)));
    }

    private static function normalizeRoot(DOMElement $root): void
    {
        if (! $root->hasAttribute('viewBox')) {
            $width = self::pixels($root->getAttribute('width'));
            $height = self::pixels($root->getAttribute('height'));

            if ($width && $height) {
                $root->setAttribute('viewBox', "0 0 $width $height");
            }
        }

        foreach (['width', 'height', 'x', 'y'] as $attribute) {
            $root->removeAttribute($attribute);
        }
    }

    /**
     * Converts an absolute SVG length to user units (px); null for anything relative.
     */
    private static function pixels(string $value): ?string
    {
        if (! preg_match('/^\s*([0-9]*\.?[0-9]+)\s*(px|mm|cm|in|pt|pc)?\s*$/i', $value, $m)) {
            return null;
        }

        $factor = ['mm' => 96 / 25.4, 'cm' => 96 / 2.54, 'in' => 96, 'pt' => 96 / 72, 'pc' => 16];
        $unit = strtolower($m[2] ?? '');
        $px = (float) $m[1] * ($factor[$unit] ?? 1);

        return rtrim(rtrim(number_format($px, 3, '.', ''), '0'), '.');
    }

    /**
     * Gives every id and class a suffix unique to this icon and rewrites the
     * references (`href="#id"`, `url(#id)`, `class=""`, selectors) to match.
     */
    private static function scopeIdentifiers(DOMDocument $dom, string $seed): void
    {
        $suffix = '-'.substr(md5($seed), 0, 6);
        $xpath = new DOMXPath($dom);

        $ids = [];
        foreach ($xpath->query('//*[@id]') as $element) {
            /** @var DOMElement $element */
            $old = $element->getAttribute('id');
            if ($old !== '') {
                $ids[$old] = $old.$suffix;
                $element->setAttribute('id', $old.$suffix);
            }
        }

        $classes = [];
        foreach (iterator_to_array($xpath->query('//*[local-name()="style"]')) as $styleElement) {
            /** @var DOMElement $styleElement */
            $css = preg_replace_callback('/\.(-?[_a-zA-Z][\w-]*)/', function ($m) use (&$classes, $suffix) {
                $classes[$m[1]] = $m[1].$suffix;

                return '.'.$classes[$m[1]];
            }, $styleElement->textContent);

            self::setStyleText($styleElement, self::rewriteUrlRefs((string) $css, $ids));
        }

        if ($classes) {
            foreach ($xpath->query('//*[@class]') as $element) {
                /** @var DOMElement $element */
                $names = preg_split('/\s+/', trim($element->getAttribute('class'))) ?: [];
                $names = array_map(fn ($name) => $classes[$name] ?? $name, $names);
                $element->setAttribute('class', implode(' ', $names));
            }
        }

        if (! $ids) {
            return;
        }

        foreach (iterator_to_array($xpath->query('//@*')) as $attr) {
            /** @var DOMAttr $attr */
            $value = $attr->value;
            $new = $value;

            if ($attr->localName === 'href' && str_starts_with($value, '#')) {
                $target = substr($value, 1);
                if (isset($ids[$target])) {
                    $new = '#'.$ids[$target];
                }
            } elseif (str_contains($value, 'url(')) {
                $new = self::rewriteUrlRefs($value, $ids);
            }

            if ($new !== $value) {
                self::setAttributeValue($attr, $new);
            }
        }
    }

    private static function setAttributeValue(DOMAttr $attr, string $value): void
    {
        $element = $attr->ownerElement;

        if ($attr->namespaceURI) {
            $element->setAttributeNS($attr->namespaceURI, $attr->nodeName, $value);
        } else {
            $element->setAttribute($attr->nodeName, $value);
        }
    }

    private static function rewriteUrlRefs(string $text, array $ids): string
    {
        if (! $ids) {
            return $text;
        }

        return (string) preg_replace_callback(
            '/url\(\s*(["\']?)#([^"\')\s]+)\1\s*\)/',
            fn ($m) => 'url(#'.($ids[$m[2]] ?? $m[2]).')',
            $text
        );
    }
}
