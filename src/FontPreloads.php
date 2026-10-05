<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado;

/**
 * Põe nos preloads de fonte a mesma revisão que o LessCompiler do core grava
 * nas URLs do CSS (`?v=<xxh128 do arquivo>`), para o preload ser o MESMO pedido
 * que a @font-face faz — senão a fonte é baixada duas vezes.
 */
final class FontPreloads
{
    /**
     * @param array<int, mixed> $preloads
     * @return array<int, mixed>
     */
    public static function versioned(array $preloads, string $fontsDir): array
    {
        foreach ($preloads as $i => $preload) {
            if (! is_array($preload) || ($preload['as'] ?? null) !== 'font' || ! is_string($preload['href'] ?? null)) {
                continue;
            }

            $href = $preload['href'];

            // Já versionado (ou com query qualquer): o core pode ter corrigido isso.
            if (str_contains($href, '?')) {
                continue;
            }

            $file = basename((string) parse_url($href, PHP_URL_PATH));

            // Só as fontes do próprio fórum, e só quando o arquivo está publicado —
            // é exatamente a condição em que o LessCompiler também versiona.
            if (! str_contains($href, '/fonts/'.$file) || ! preg_match('/^[\w.-]+\.woff2?$/', $file)) {
                continue;
            }

            $path = $fontsDir.'/'.$file;
            $hash = is_file($path) ? @hash_file('xxh128', $path) : false;

            if ($hash !== false) {
                $preloads[$i]['href'] = $href.'?v='.$hash;
            }
        }

        return $preloads;
    }
}
