<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;
use Ramon\Avocado\Controller\UploadLogoSvgController;

/**
 * Exercises UploadLogoSvgController::sanitizeSvg() — the SVG XSS/XXE scrub that
 * runs on every admin logo upload before the markup is rendered inline (§9.5).
 *
 * sanitizeSvg() (and the cleanNode/sanitizeStyleNode/useHasExternalHref helpers
 * it drives) carries no instance state, so we drive it through reflection on an
 * instance built without the parent UploadImageController constructor.
 */
#[Group('security')]
final class SvgSanitizerTest extends TestCase
{
    private const NS = 'xmlns="http://www.w3.org/2000/svg"';

    private function sanitize(string $svg): string
    {
        $controller = (new ReflectionClass(UploadLogoSvgController::class))
            ->newInstanceWithoutConstructor();

        // PHP 8.1+ reflection reaches private methods without setAccessible(),
        // which is a deprecated no-op since 8.5.
        $method = new ReflectionMethod(UploadLogoSvgController::class, 'sanitizeSvg');

        return (string) $method->invoke($controller, $svg);
    }

    public function test_doctype_declaration_is_rejected_before_parsing(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->sanitize('<!DOCTYPE svg><svg ' . self::NS . '></svg>');
    }

    public function test_entity_declaration_is_rejected_before_parsing(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->sanitize(
            '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
            . '<svg ' . self::NS . '><text>&xxe;</text></svg>'
        );
    }

    public function test_non_svg_root_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->sanitize('<html><body>not an svg</body></html>');
    }

    public function test_malformed_xml_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->sanitize('<svg ' . self::NS . '><rect></svg>');
    }

    public function test_clean_svg_passes_through(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . ' viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>'
        );

        self::assertStringContainsString('<path', $out);
        self::assertStringContainsString('M0 0h10v10H0z', $out);
    }

    public function test_script_element_is_stripped(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . '><script>alert(1)</script><rect/></svg>'
        );

        self::assertStringNotContainsString('<script', $out);
        self::assertStringNotContainsString('alert(1)', $out);
        self::assertStringContainsString('<rect', $out);
    }

    public function test_anchor_element_is_stripped(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . '><a href="javascript:alert(1)"><rect/></a></svg>'
        );

        self::assertStringNotContainsString('<a ', $out);
        self::assertStringNotContainsString('javascript:', $out);
    }

    public function test_event_handler_attribute_is_stripped(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . ' onload="alert(1)"><rect/></svg>'
        );

        self::assertStringNotContainsString('onload', $out);
    }

    public function test_javascript_scheme_attribute_is_stripped(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . '><rect fill="javascript:alert(1)"/></svg>'
        );

        self::assertStringNotContainsString('javascript:', $out);
    }

    public function test_style_with_import_is_dropped(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . '><style>@import url(https://evil.example/x.css);</style><rect/></svg>'
        );

        self::assertStringNotContainsString('@import', $out);
        self::assertStringNotContainsString('<style', $out);
        self::assertStringContainsString('<rect', $out);
    }

    public function test_benign_animation_style_is_kept(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . '><style>@keyframes spin{to{transform:rotate(360deg)}}</style><rect/></svg>'
        );

        self::assertStringContainsString('keyframes', $out);
    }

    public function test_use_with_external_href_is_stripped(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . '><use href="https://evil.example/x.svg#a"/></svg>'
        );

        self::assertStringNotContainsString('evil.example', $out);
    }

    public function test_use_with_internal_fragment_href_is_kept(): void
    {
        $out = $this->sanitize(
            '<svg ' . self::NS . '><defs><rect id="a"/></defs><use href="#a"/></svg>'
        );

        self::assertStringContainsString('<use', $out);
        self::assertStringContainsString('#a', $out);
    }
}
