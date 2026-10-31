<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

/**
 * O navegador resolve os escapes do CSS (`\75 rl(`, `@\69mport`) antes de
 * reconhecer funções e at-rules; os filtros de CSS perigoso testam a forma
 * decodificada, senão um escape passa por qualquer lista de bloqueio.
 */
final class CssEscapes
{
    public static function decode(string $css): string
    {
        $css = (string) preg_replace_callback(
            '/\\\\([0-9a-fA-F]{1,6})\s?/',
            static function (array $m): string {
                $code = hexdec($m[1]);

                return is_int($code) && $code > 0 && $code <= 0x10FFFF ? mb_chr($code, 'UTF-8') : "\u{FFFD}";
            },
            $css
        );

        // Qualquer outro caractere escapado vale ele mesmo; barra antes de quebra de linha some.
        return (string) preg_replace('/\\\\(\r\n|[\s\S])/', '$1', $css);
    }
}
