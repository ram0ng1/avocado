<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use Illuminate\Cache\ArrayStore;
use Illuminate\Cache\Repository;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Support\HtmlSanitizer;
use Ramon\Avocado\Support\SanitizedHtmlCache;

/**
 * O cache do sanitizador não pode mudar a saída nem servir o HTML de antes
 * depois que o admin salva outro.
 */
final class SanitizedHtmlCacheTest extends TestCase
{
    private Repository $cache;

    private SanitizedHtmlCache $sanitizer;

    protected function setUp(): void
    {
        $this->cache = new Repository(new ArrayStore());
        $this->sanitizer = new SanitizedHtmlCache($this->cache);
    }

    public function test_output_matches_the_sanitizer(): void
    {
        $html = '<div onclick="x()"><script>alert(1)</script><a href="javascript:alert(1)">oi</a><b>ok</b></div>';

        $this->assertSame(HtmlSanitizer::sanitize($html), $this->sanitizer->sanitize('hero', $html));
        // Segunda leitura, agora do cache: mesma coisa.
        $this->assertSame(HtmlSanitizer::sanitize($html), $this->sanitizer->sanitize('hero', $html));
    }

    public function test_reads_from_cache_while_the_input_is_the_same(): void
    {
        $html = '<p>hero</p>';
        $this->sanitizer->sanitize('hero', $html);

        // Prova de que a segunda chamada não refaz o parse: o valor plantado volta.
        $this->cache->forever('avocado.sanitized_html.v1.hero', ['hash' => hash('xxh128', $html), 'html' => 'DO-CACHE']);

        $this->assertSame('DO-CACHE', $this->sanitizer->sanitize('hero', $html));
    }

    public function test_a_new_input_is_sanitized_again(): void
    {
        $this->sanitizer->sanitize('hero', '<p>antes</p>');

        $html = '<p>depois<img src=x onerror=alert(1)></p>';

        $this->assertSame(HtmlSanitizer::sanitize($html), $this->sanitizer->sanitize('hero', $html));
    }

    public function test_fields_do_not_share_entries(): void
    {
        $this->sanitizer->sanitize('hero', '<p>hero</p>');

        $this->assertSame(HtmlSanitizer::sanitize('<p>spinner</p>'), $this->sanitizer->sanitize('spinner', '<p>spinner</p>'));
        $this->assertSame(HtmlSanitizer::sanitize('<p>hero</p>'), $this->sanitizer->sanitize('hero', '<p>hero</p>'));
    }

    public function test_empty_input_skips_the_cache(): void
    {
        $this->assertSame('', $this->sanitizer->sanitize('hero', "  \n "));
        $this->assertNull($this->cache->get('avocado.sanitized_html.v1.hero'));
    }
}
