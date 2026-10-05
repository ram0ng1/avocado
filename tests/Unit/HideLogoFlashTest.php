<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Cache\ArrayStore;
use Illuminate\Cache\Repository;
use Illuminate\Contracts\Filesystem\Factory;
use Illuminate\Contracts\Filesystem\Filesystem;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Content\HideLogoFlash;

/**
 * O logo embutido no <head>: só com viewBox medido para o arquivo atual, e sem
 * que o conteúdo do SVG ou o título do fórum consigam fechar o <script>.
 */
final class HideLogoFlashTest extends TestCase
{
    private const PATH = 'avocado-logo-abc.svg';

    /** @param array<string, string> $settings */
    private function script(array $settings, ?string $svg): ?string
    {
        $repo = $this->createStub(SettingsRepositoryInterface::class);
        $repo->method('get')->willReturnCallback(fn (string $key, $default = null) => $settings[$key] ?? $default);

        $disk = $this->createStub(Filesystem::class);
        $disk->method('exists')->willReturn($svg !== null);
        $disk->method('get')->willReturn($svg);

        $factory = $this->createStub(Factory::class);
        $factory->method('disk')->willReturn($disk);

        $content = new HideLogoFlash($repo, $factory, new Repository(new ArrayStore()));

        /** @var string|null */
        return (new \ReflectionMethod($content, 'inlineScript'))->invoke($content, self::PATH);
    }

    /** @return array<string, string> */
    private function settings(string $viewBoxPath = self::PATH): array
    {
        return [
            'avocado.logo_svg_viewbox' => (string) json_encode(['path' => $viewBoxPath, 'viewBox' => '-1.5 2 100 50']),
            'forum_title'              => 'Fórum </script><script>alert(1)</script>',
        ];
    }

    public function test_embeds_the_svg_with_the_stored_view_box(): void
    {
        $out = $this->script($this->settings(), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path d="M0 0h10v10z"/></svg>');

        $this->assertNotNull($out);
        $this->assertStringStartsWith('<script id="avocado-logo-inline">', $out);
        $this->assertStringContainsString('"v":"-1.5 2 100 50"', $out);
        $this->assertStringContainsString('M0 0h10v10z', $out);
    }

    public function test_nothing_inside_can_close_the_script_tag(): void
    {
        $out = (string) $this->script($this->settings(), '<svg xmlns="http://www.w3.org/2000/svg"><text>&lt;/script&gt;</text><desc></script><img src=x onerror=alert(1)></desc></svg>');

        // Uma única ocorrência de "</script" — a do fim — e nenhum "<" cru vindo do JSON.
        $this->assertSame(1, substr_count(strtolower($out), '</script'));
        $this->assertStringEndsWith('</script>', $out);
        $this->assertStringNotContainsString('<svg', $out);
        $this->assertStringNotContainsString('<img', $out);
    }

    public function test_falls_back_without_a_measure_for_this_file(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';

        $this->assertNull($this->script($this->settings('avocado-logo-old.svg'), $svg));
        $this->assertNull($this->script([], $svg));
    }

    public function test_falls_back_when_the_file_is_missing(): void
    {
        $this->assertNull($this->script($this->settings(), null));
    }
}
