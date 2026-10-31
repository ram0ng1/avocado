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

use Illuminate\Contracts\Cache\Repository as Cache;

/**
 * HtmlSanitizer com o resultado guardado no cache do Flarum.
 *
 * O `serializeToForum` roda em toda página, e o HTML só muda quando o admin salva.
 * A saída é guardada com o hash da entrada, numa chave por campo para não
 * acumular entradas órfãs. Mude a versão da chave quando a regra mudar.
 */
class SanitizedHtmlCache
{
    private const VERSION = 'v1';

    public function __construct(protected Cache $cache)
    {
    }

    public function sanitize(string $field, string $html): string
    {
        // Vazio é o caso comum (hero desligado): nem cache, nem DOM.
        if (trim($html) === '') {
            return '';
        }

        $key = 'avocado.sanitized_html.'.self::VERSION.'.'.$field;
        $hash = hash('xxh128', $html);
        $cached = $this->cache->get($key);

        if (is_array($cached) && ($cached['hash'] ?? null) === $hash && is_string($cached['html'] ?? null)) {
            return $cached['html'];
        }

        $clean = HtmlSanitizer::sanitize($html);
        $this->cache->forever($key, ['hash' => $hash, 'html' => $clean]);

        return $clean;
    }
}
