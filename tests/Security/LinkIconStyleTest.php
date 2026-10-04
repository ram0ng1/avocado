<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Security;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Filesystem\Factory;
use Illuminate\Contracts\Filesystem\Filesystem;
use Mockery;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ServerRequestInterface;
use Ramon\Avocado\Content\LinkIconStyle;
use ReflectionClass;

/**
 * LinkIconStyle põe o SVG do "ícone de link interno" num <style> do <head>, no
 * primeiro paint. O arquivo foi sanitizado no upload, mas é relido do disco a
 * cada página: aqui se garante que ele é sanitizado de novo na saída e que nada
 * do conteúdo chega cru ao CSS (só base64, que não fecha `url("…")` nem </style>).
 */
#[Group('security')]
final class LinkIconStyleTest extends TestCase
{
    use MockeryPHPUnitIntegration;

    /** @return list<string> */
    private function render(?string $setting, ?string $fileContents): array
    {
        $settings = Mockery::mock(SettingsRepositoryInterface::class);
        $settings->allows('get')->with('avocado.link_icon_svg')->andReturn($setting);

        $disk = Mockery::mock(Filesystem::class);
        $disk->allows('exists')->andReturn($fileContents !== null);
        $disk->allows('get')->andReturn($fileContents);

        $factory = Mockery::mock(Factory::class);
        $factory->allows('disk')->with('flarum-assets')->andReturn($disk);

        // Document tem construtor pesado (view, locale…); só o array head importa.
        $document = (new ReflectionClass(Document::class))->newInstanceWithoutConstructor();
        $document->head = [];

        (new LinkIconStyle($settings, $factory))($document, Mockery::mock(ServerRequestInterface::class));

        return $document->head;
    }

    public function test_nothing_is_emitted_without_an_icon(): void
    {
        self::assertSame([], $this->render(null, null));
        self::assertSame([], $this->render('', null));
    }

    public function test_nothing_is_emitted_when_the_file_is_missing(): void
    {
        self::assertSame([], $this->render('avocado-link-icon-abc.svg', null));
    }

    public function test_valid_icon_becomes_a_base64_css_variable(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
        $head = $this->render('avocado-link-icon-abc.svg', $svg);

        self::assertCount(2, $head);
        self::assertMatchesRegularExpression(
            '#^<style id="avocado-link-icon">:root\{--avocado-link-icon:url\("data:image/svg\+xml;base64,[A-Za-z0-9+/=]+"\)\}</style>$#',
            $head[0]
        );
        self::assertSame('<script>document.documentElement.dataset.avocadoLinkIcon="true"</script>', $head[1]);
    }

    public function test_scriptable_parts_are_scrubbed_before_reaching_the_page(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">'
            . '<script>alert(2)</script><path d="M0 0h24v24H0z"/></svg>';
        $head = $this->render('avocado-link-icon-abc.svg', $svg);

        self::assertCount(2, $head);
        self::assertSame(1, preg_match('#base64,([A-Za-z0-9+/=]+)#', $head[0], $m));

        $decoded = base64_decode($m[1], true);
        self::assertIsString($decoded);
        self::assertStringContainsString('<path', $decoded);
        self::assertStringNotContainsStringIgnoringCase('<script', $decoded);
        self::assertStringNotContainsStringIgnoringCase('onload', $decoded);
    }

    public function test_style_break_out_after_the_svg_emits_nothing(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
            . '")}</style><script>alert(3)</script>';

        self::assertSame([], $this->render('avocado-link-icon-abc.svg', $svg));
    }

    public function test_non_svg_file_emits_nothing(): void
    {
        self::assertSame([], $this->render('avocado-link-icon-abc.svg', '<html><body>oi</body></html>'));
    }
}
