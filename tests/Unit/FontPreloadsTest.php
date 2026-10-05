<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Ramon\Avocado\FontPreloads;

/**
 * O preload de fonte precisa ter a MESMA URL que a @font-face do CSS compilado
 * (`?v=<xxh128>`), senão o navegador baixa a fonte duas vezes.
 */
final class FontPreloadsTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir().'/avocado-fonts-'.bin2hex(random_bytes(4));
        mkdir($this->dir);
        file_put_contents($this->dir.'/fa-solid-900.woff2', 'fake-font-bytes');
    }

    protected function tearDown(): void
    {
        @unlink($this->dir.'/fa-solid-900.woff2');
        @rmdir($this->dir);
    }

    public function test_adds_the_same_revision_the_less_compiler_uses(): void
    {
        $out = FontPreloads::versioned([
            ['href' => 'https://f.test/assets/fonts/fa-solid-900.woff2', 'as' => 'font', 'type' => 'font/woff2', 'crossorigin' => ''],
        ], $this->dir);

        $this->assertSame(
            'https://f.test/assets/fonts/fa-solid-900.woff2?v='.hash('xxh128', 'fake-font-bytes'),
            $out[0]['href']
        );
    }

    public function test_leaves_everything_else_alone(): void
    {
        $preloads = [
            ['href' => 'https://f.test/assets/forum.js?v=abc', 'as' => 'script'],
            ['href' => 'https://f.test/assets/fonts/fa-solid-900.woff2?v=already', 'as' => 'font'],
            ['href' => 'https://f.test/assets/fonts/missing.woff2', 'as' => 'font'],
            'not-an-array',
        ];

        $this->assertSame($preloads, FontPreloads::versioned($preloads, $this->dir));
    }
}
