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

/**
 * O viewBox recortado do logo SVG, medido uma vez no navegador do admin.
 *
 * O recorte precisa de getBBox, que só o navegador calcula, então o admin mede e
 * o servidor só lê. Guarda também o caminho do arquivo: um logo novo tem outro
 * nome, e um viewBox antigo nunca vale para ele (o front mede sozinho).
 */
final class LogoViewBox
{
    public const SETTING = 'avocado.logo_svg_viewbox';

    private const NUMBER = '[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?';

    /**
     * O viewBox gravado, se for do arquivo `$path` e estiver bem formado.
     */
    public static function forPath(string $stored, string $path): ?string
    {
        if ($stored === '' || $path === '') {
            return null;
        }

        $decoded = json_decode($stored, true);

        if (! is_array($decoded) || ($decoded['path'] ?? null) !== $path || ! is_string($decoded['viewBox'] ?? null)) {
            return null;
        }

        return self::normalize($decoded['viewBox']);
    }

    /**
     * Quatro números separados por espaço, largura e altura positivas e finitas.
     * Devolve a string como veio (o front aplica o mesmo texto que mediu); vai
     * para dentro de um <script>, então qualquer outra coisa é recusada.
     */
    public static function normalize(string $viewBox): ?string
    {
        $viewBox = trim($viewBox);

        if (! preg_match('/^'.self::NUMBER.'(?: '.self::NUMBER.'){3}$/', $viewBox)) {
            return null;
        }

        $parts = array_map('floatval', explode(' ', $viewBox));

        foreach ($parts as $n) {
            if (! is_finite($n)) {
                return null;
            }
        }

        return $parts[2] > 0 && $parts[3] > 0 ? $viewBox : null;
    }
}
