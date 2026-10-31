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

namespace Ramon\Avocado\Support;

use DOMDocument;
use DOMElement;
use DOMXPath;

/**
 * Defesa em profundidade para o HTML que o admin cola (hero, spinner) e que
 * chega a `m.trust()`/`innerHTML` para todo visitante. Denylist, não allowlist:
 * tira elementos executáveis, <style>, SMIL, handlers on* e URLs/estilos perigosos.
 */
final class HtmlSanitizer
{
    // <noscript> e <template> mudam o contexto do parser de HTML de um jeito que o
    // DOMDocument não reproduz (mXSS), e não têm uso aqui.
    private const STRIP_ELEMENTS = [
        'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'noscript', 'template',
        // loadHTML põe os nomes em minúsculas, inclusive os do SVG.
        'foreignobject', 'animate', 'set', 'animatemotion', 'animatetransform',
    ];

    private const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'background', 'poster'];

    private const DANGEROUS_SCHEME = '/^\s*(?:javascript|vbscript|data:text\/html)/i';

    private const DANGEROUS_STYLE = '/expression\s*\(|javascript:|vbscript:|@import/i';

    /**
     * Teto de passes; markup limpo converge em dois.
     */
    private const MAX_PASSES = 5;

    public static function sanitize(string $html): string
    {
        $trimmed = trim($html);
        if ($trimmed === '') {
            return '';
        }

        // mXSS: a saída reparseada pode virar outra árvore. Repete até a serialização
        // parar de mudar, para pegar o que só fica perigoso depois de um ciclo.
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

        // Raiz marcada, para serializar sem o <html>/<body> que o loadHTML acrescenta.
        $wrapped = '<?xml encoding="UTF-8"?><div id="__avs_root__">' . $trimmed . '</div>';
        $loaded  = $dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded) {
            return '';
        }

        $xpath = new DOMXPath($dom);

        // Comentários saem: comentários condicionais e `<!-- --><script>` são vetor de mXSS.
        $comments = $xpath->query('//comment()');
        if ($comments !== false) {
            foreach (iterator_to_array($comments) as $comment) {
                $comment->parentNode?->removeChild($comment);
            }
        }

        $query = '//' . implode(' | //', self::STRIP_ELEMENTS);
        $nodes = $xpath->query($query);
        if ($nodes !== false) {
            foreach (iterator_to_array($nodes) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }

        $allEls = $xpath->query('//*');
        if ($allEls !== false) {
            foreach ($allEls as $el) {
                if (! $el instanceof DOMElement) {
                    continue;
                }
                self::scrubAttributes($el);
            }
        }

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
        // Cópia: remover durante a iteração quebra a NodeList viva.
        foreach (iterator_to_array($el->attributes) as $attr) {
            $name  = strtolower($attr->nodeName);
            $value = (string) $attr->nodeValue;

            if (str_starts_with($name, 'on')) {
                $el->removeAttribute($attr->nodeName);
                continue;
            }

            if (in_array($name, self::URL_ATTRS, true) && self::isDangerousUrl($value)) {
                $el->removeAttribute($attr->nodeName);
                continue;
            }

            if ($name === 'style' && preg_match(self::DANGEROUS_STYLE, CssEscapes::decode($value))) {
                $el->removeAttribute($attr->nodeName);
            }
        }
    }

    /**
     * O navegador ignora tab/quebra de linha na URL e controles no começo
     * (`java\tscript:` roda como `javascript:`): testa o esquema que ele vai ver.
     */
    public static function isDangerousUrl(string $value): bool
    {
        $normalized = (string) preg_replace('/[\x00-\x20\x7F]+/', '', $value);

        return preg_match(self::DANGEROUS_SCHEME, $normalized) === 1;
    }
}
