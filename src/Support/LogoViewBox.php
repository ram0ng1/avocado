<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

/**
 * O viewBox recortado do logo SVG, medido uma vez no navegador do admin.
 *
 * O recorte (bounding box de cada elemento desenhado + 3% de folga) precisa de
 * getBBox — geometria real de path, texto e transform —, que só o navegador
 * calcula. Antes o front refazia essa medição em toda página; agora o admin
 * mede ao abrir a página do tema e grava aqui, e o servidor só lê.
 *
 * A setting guarda também o caminho do arquivo medido
 * (`{"path":"avocado-logo-x.svg","viewBox":"x y w h"}`): um logo novo tem outro
 * nome, então um viewBox antigo nunca é aplicado ao arquivo errado — sem
 * correspondência, o front volta a medir como antes.
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
