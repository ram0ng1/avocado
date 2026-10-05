<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Illuminate\Contracts\Cache\Repository as Cache;

/**
 * HtmlSanitizer com o resultado guardado no cache do Flarum.
 *
 * O HTML do hero personalizado vai no payload do fórum — toda página e todo
 * GET /api passam pelo `serializeToForum`, e cada passada rodava o parse do DOM
 * de novo (até cinco passes no pior caso) sobre um texto que só muda quando o
 * admin salva. O sanitizador é determinístico, então a saída é guardada junto do
 * hash da entrada: trocou o HTML, o hash não bate e a próxima leitura refaz.
 *
 * Uma chave por campo (e não uma por hash) para não acumular entradas órfãs a
 * cada edição do admin. A versão no nome muda quando a regra do sanitizador
 * mudar — e o `cache:clear` de todo deploy já descarta o resto.
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
