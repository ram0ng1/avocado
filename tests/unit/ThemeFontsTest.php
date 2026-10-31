<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\unit;

use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Filesystem\Cloud;
use Illuminate\Contracts\Filesystem\Factory;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Content\ThemeFonts;

/**
 * A fonte escolhida no admin vira CSS inline (--avocado-font-sans, @font-face)
 * e um preload. O que o admin digita em "família personalizada" entra num
 * <style>, então só pode sair de lá normalizado.
 */
final class ThemeFontsTest extends TestCase
{
    /** @param array<string, string> $settings */
    private function fonts(array $settings = []): ThemeFonts
    {
        $disk = $this->createStub(Cloud::class);
        $disk->method('url')->willReturnCallback(fn (string $file) => 'https://f.test/assets/'.$file);

        $factory = $this->createStub(Factory::class);
        $factory->method('disk')->willReturn($disk);

        $repository = $this->createStub(SettingsRepositoryInterface::class);
        $repository->method('get')->willReturnCallback(fn (string $key, $default = null) => $settings[$key] ?? $default);

        return new ThemeFonts($factory, $repository);
    }

    public function test_default_is_dm_sans_with_its_faces_and_preload(): void
    {
        $fonts = $this->fonts();

        $this->assertSame(ThemeFonts::DM_SANS, $fonts->choice());
        $this->assertStringStartsWith("'DM Sans Variable'", $fonts->stack());
        $this->assertSame(4, substr_count($fonts->fontFaces(), '@font-face'));
        $this->assertSame('https://f.test/assets/fonts/dm-sans-variable.woff2', $fonts->preloadUrl());
    }

    public function test_system_font_ships_no_file(): void
    {
        $fonts = $this->fonts(['avocado.font_family' => ThemeFonts::SYSTEM]);

        $this->assertStringStartsWith('system-ui', $fonts->stack());
        $this->assertSame('', $fonts->fontFaces());
        $this->assertNull($fonts->preloadUrl());
    }

    public function test_inter_declares_every_subset_and_preloads_the_latin_one(): void
    {
        $fonts = $this->fonts(['avocado.font_family' => ThemeFonts::INTER]);
        $faces = $fonts->fontFaces();

        $this->assertStringStartsWith("'Inter Variable'", $fonts->stack());
        // 7 subconjuntos × normal e itálico, cada um com o seu unicode-range.
        $this->assertSame(14, substr_count($faces, '@font-face'));
        $this->assertSame(14, substr_count($faces, 'unicode-range:'));
        $this->assertStringContainsString('fonts/inter-vietnamese-wght-normal.woff2', $faces);
        $this->assertSame('https://f.test/assets/fonts/inter-latin-wght-normal.woff2', $fonts->preloadUrl());
    }

    public function test_every_declared_inter_file_is_bundled(): void
    {
        preg_match_all('~fonts/(inter-[a-z-]+\.woff2)~', $this->fonts(['avocado.font_family' => ThemeFonts::INTER])->fontFaces(), $matches);

        $this->assertCount(14, array_unique($matches[1]));

        foreach ($matches[1] as $file) {
            $this->assertFileExists(dirname(__DIR__, 2).'/assets/fonts/'.$file);
        }
    }

    public function test_custom_uses_the_normalized_family(): void
    {
        $fonts = $this->fonts([
            'avocado.font_family'        => ThemeFonts::CUSTOM,
            'avocado.font_custom_family' => '"Noto Sans", Roboto',
        ]);

        $this->assertSame(ThemeFonts::CUSTOM, $fonts->choice());
        $this->assertSame("'Noto Sans','Roboto',sans-serif", $fonts->stack());
        $this->assertSame('', $fonts->fontFaces());
        $this->assertNull($fonts->preloadUrl());
    }

    public function test_custom_without_a_usable_family_falls_back_to_the_default(): void
    {
        $fonts = $this->fonts([
            'avocado.font_family'        => ThemeFonts::CUSTOM,
            'avocado.font_custom_family' => '</style><script>',
        ]);

        $this->assertSame(ThemeFonts::DM_SANS, $fonts->choice());
        $this->assertStringStartsWith("'DM Sans Variable'", $fonts->stack());
    }

    public function test_unknown_choice_falls_back_to_the_default(): void
    {
        $this->assertSame(ThemeFonts::DM_SANS, $this->fonts(['avocado.font_family' => 'comic-sans'])->choice());
    }

    /** @return array<string, array{string, ?string}> */
    public static function families(): array
    {
        return [
            'nome simples'              => ['Inter', "'Inter',sans-serif"],
            'aspas e genérica'          => ['"Noto Sans", sans-serif', "'Noto Sans',sans-serif"],
            'genérica não ganha aspas'  => ['system-ui, Segoe UI', "system-ui,'Segoe UI'"],
            'não-latino'                => ['思源黑体, serif', "'思源黑体',serif"],
            'espaços extras'            => ["  Open   Sans  ,\tArial ", "'Open Sans','Arial',sans-serif"],
            'aspa sem par é reemitida'  => ["'Inter, Roboto", "'Inter','Roboto',sans-serif"],
            'vazio'                     => ['', null],
            'só lixo'                   => [';}{<>', null],
            'fecha o style'             => ['Inter</style><script>alert(1)</script>', null],
            'quebra a declaração'       => ['Inter;}body{display:none', null],
            'url() e barra invertida'   => ['url(x), a\\b, Inter', "'Inter',sans-serif"],
            'aproveita a parte válida'  => ['Inter, </style>, Roboto', "'Inter','Roboto',sans-serif"],
        ];
    }

    #[DataProvider('families')]
    public function test_sanitize_family(string $input, ?string $expected): void
    {
        $this->assertSame($expected, ThemeFonts::sanitizeFamily($input));
    }

    public function test_sanitized_family_never_carries_css_or_html_syntax(): void
    {
        $out = (string) ThemeFonts::sanitizeFamily('A"B, C\'D, E}F, G;H, I<J, K\\L, M(N), Ok Font');

        $this->assertSame("'Ok Font',sans-serif", $out);
    }

    public function test_long_lists_are_capped(): void
    {
        $out = (string) ThemeFonts::sanitizeFamily(implode(',', array_map(fn (int $i) => 'Font'.$i, range(1, 30))));

        $this->assertSame(9, count(explode(',', $out)));
    }
}
