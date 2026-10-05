<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Support\HtmlSanitizer;

/**
 * The output of HtmlSanitizer::sanitize() ultimately reaches m.trust()/innerHTML
 * on the public site (custom hero HTML, loading-spinner HTML). These tests pin
 * the XSS-sink stripping so a refactor can't silently re-open it.
 *
 * Assertions use substring checks rather than exact-equality because DOMDocument
 * normalizes quoting/attribute order on serialization.
 */
#[Group('security')]
final class HtmlSanitizerTest extends TestCase
{
    public function test_empty_input_returns_empty_string(): void
    {
        self::assertSame('', HtmlSanitizer::sanitize(''));
    }

    public function test_whitespace_only_input_returns_empty_string(): void
    {
        self::assertSame('', HtmlSanitizer::sanitize("   \n\t  "));
    }

    public function test_benign_inline_markup_is_preserved(): void
    {
        $out = HtmlSanitizer::sanitize('<p>Hello <strong>bold</strong> and <em>italic</em></p>');

        self::assertStringContainsString('<strong>bold</strong>', $out);
        self::assertStringContainsString('<em>italic</em>', $out);
        self::assertStringContainsString('Hello', $out);
    }

    public function test_script_element_is_stripped_but_surrounding_content_kept(): void
    {
        $out = HtmlSanitizer::sanitize('<p>safe</p><script>alert(1)</script>');

        self::assertStringNotContainsString('<script', $out);
        self::assertStringNotContainsString('alert(1)', $out);
        self::assertStringContainsString('safe', $out);
    }

    #[DataProvider('dangerousElements')]
    public function test_dangerous_elements_are_stripped(string $tag, string $payload): void
    {
        $out = HtmlSanitizer::sanitize('<p>keep</p>' . $payload);

        self::assertStringNotContainsString('<' . $tag, strtolower($out));
        self::assertStringContainsString('keep', $out);
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function dangerousElements(): array
    {
        return [
            'style'  => ['style', '<style>body{background:url(evil)}</style>'],
            'iframe' => ['iframe', '<iframe src="https://evil.example"></iframe>'],
            'object' => ['object', '<object data="x"></object>'],
            'embed'  => ['embed', '<embed src="x">'],
            'link'   => ['link', '<link rel="stylesheet" href="x">'],
            'meta'   => ['meta', '<meta http-equiv="refresh" content="0;url=evil">'],
            'base'   => ['base', '<base href="https://evil.example/">'],
            'form'   => ['form', '<form action="https://evil.example"><input></form>'],
        ];
    }

    public function test_event_handler_attributes_are_removed(): void
    {
        $out = HtmlSanitizer::sanitize('<div onclick="steal()" onmouseover="x()">hi</div>');

        self::assertStringNotContainsString('onclick', $out);
        self::assertStringNotContainsString('onmouseover', $out);
        self::assertStringContainsString('hi', $out);
    }

    #[DataProvider('dangerousUrlSchemes')]
    public function test_dangerous_url_schemes_are_stripped_from_links(string $href): void
    {
        $out = HtmlSanitizer::sanitize('<a href="' . $href . '">click</a>');

        // The <a> survives; only the dangerous href is dropped.
        self::assertStringContainsString('click', $out);
        self::assertStringNotContainsString($href, $out);
    }

    /** @return array<string, array{0: string}> */
    public static function dangerousUrlSchemes(): array
    {
        return [
            'javascript' => ['javascript:alert(1)'],
            'vbscript'   => ['vbscript:msgbox(1)'],
            'data html'  => ['data:text/html,<script>alert(1)</script>'],
        ];
    }

    public function test_safe_https_href_is_preserved(): void
    {
        $out = HtmlSanitizer::sanitize('<a href="https://example.com/page">link</a>');

        self::assertStringContainsString('https://example.com/page', $out);
    }

    public function test_data_image_src_is_preserved(): void
    {
        // Only data:text/html is dangerous; data:image/* is a legitimate inline asset.
        $src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        $out = HtmlSanitizer::sanitize('<img src="' . $src . '" alt="x">');

        self::assertStringContainsString('data:image/png', $out);
    }

    #[DataProvider('dangerousStyles')]
    public function test_dangerous_inline_styles_are_removed(string $style): void
    {
        $out = HtmlSanitizer::sanitize('<div style="' . $style . '">x</div>');

        self::assertStringNotContainsString('style=', $out);
        self::assertStringContainsString('x', $out);
    }

    /** @return array<string, array{0: string}> */
    public static function dangerousStyles(): array
    {
        return [
            'expression' => ['width:expression(alert(1))'],
            'import'     => ['@import url(https://evil.example/x.css)'],
            'javascript' => ['background:url(javascript:alert(1))'],
        ];
    }

    public function test_benign_inline_style_is_preserved(): void
    {
        $out = HtmlSanitizer::sanitize('<div style="color:red;font-weight:bold">x</div>');

        self::assertStringContainsString('color:red', $out);
    }

    public function test_html_comments_are_stripped(): void
    {
        $out = HtmlSanitizer::sanitize('<p>keep</p><!-- <script>alert(1)</script> -->');

        self::assertStringNotContainsString('<!--', $out);
        self::assertStringNotContainsString('alert(1)', $out);
        self::assertStringContainsString('keep', $out);
    }

    #[DataProvider('mxssElements')]
    public function test_parser_context_elements_are_stripped(string $tag, string $payload): void
    {
        $out = HtmlSanitizer::sanitize('<p>keep</p>' . $payload);

        self::assertStringNotContainsString('<' . $tag, strtolower($out));
        self::assertStringNotContainsString('onerror', strtolower($out));
        self::assertStringContainsString('keep', $out);
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function mxssElements(): array
    {
        return [
            // <noscript>/<template> bodies are re-parsed by the browser in a
            // context DOMDocument doesn't replicate — the mutation-XSS vector.
            'noscript' => ['noscript', '<noscript><img src=x onerror=alert(1)></noscript>'],
            'template' => ['template', '<template><img src=x onerror=alert(1)></template>'],
        ];
    }

    public function test_sanitization_is_idempotent(): void
    {
        // The mXSS guard re-scrubs until output stabilizes; a second pass over an
        // already-clean payload must be a no-op (no markup re-introduced/altered).
        $payloads = [
            '<p>Hello <strong>bold</strong></p>',
            '<a href="https://example.com">link</a>',
            '<div style="color:red">x</div>',
            '<noscript><img src=x onerror=alert(1)></noscript>safe',
            '<p>keep</p><!-- comment --><script>alert(1)</script>',
        ];

        foreach ($payloads as $payload) {
            $once = HtmlSanitizer::sanitize($payload);
            self::assertSame($once, HtmlSanitizer::sanitize($once), "Not idempotent for: {$payload}");
        }
    }

    // ── Esquema ofuscado (auditoria de segurança) ───────────────────────────
    // O navegador ignora tab/quebra de linha no meio de uma URL e controles no
    // começo: `java&#9;script:` roda como `javascript:`. O xlink:href não passa
    // pelo escape de URL do libxml, então a checagem precisa normalizar.

    /** @return array<string, array{string}> */
    public static function obfuscatedSchemeProvider(): array
    {
        return [
            'tab em xlink:href'      => ['<svg><a xlink:href="java&#9;script:alert(1)"><text>x</text></a></svg>'],
            'quebra de linha'        => ['<svg><a xlink:href="java&#10;script:alert(1)"><text>x</text></a></svg>'],
            'controle no começo'     => ['<svg><a xlink:href="&#1;javascript:alert(1)"><text>x</text></a></svg>'],
            'tab em href comum'      => ['<a href="java&#9;script:alert(1)">x</a>'],
            'vbscript com espaços'   => ['<a href=" vb&#9;script:alert(1)">x</a>'],
        ];
    }

    #[DataProvider('obfuscatedSchemeProvider')]
    public function test_obfuscated_script_scheme_is_stripped(string $payload): void
    {
        $out = HtmlSanitizer::sanitize($payload);

        self::assertStringNotContainsString('alert(1)', $out, $out);
        self::assertStringContainsString('x', $out);
    }

    public function test_smil_animate_rewriting_href_is_stripped(): void
    {
        $out = HtmlSanitizer::sanitize(
            '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text y="20">x</text></a></svg>'
        );

        self::assertStringNotContainsString('<animate', $out);
        self::assertStringNotContainsString('alert(1)', $out);
        self::assertStringContainsString('<text', $out);
    }

    public function test_set_and_foreign_object_are_stripped(): void
    {
        $out = HtmlSanitizer::sanitize(
            '<svg><set attributeName="href" to="javascript:alert(1)"/>'
            . '<foreignObject><div onclick="alert(2)">y</div></foreignObject><rect/></svg>'
        );

        self::assertStringNotContainsString('<set', $out);
        self::assertStringNotContainsString('foreignobject', strtolower($out));
        self::assertStringNotContainsString('alert(', $out);
        self::assertStringContainsString('<rect', $out);
    }

    public function test_is_dangerous_url_sees_what_the_browser_sees(): void
    {
        self::assertTrue(HtmlSanitizer::isDangerousUrl("java	script:alert(1)"));
        self::assertTrue(HtmlSanitizer::isDangerousUrl(" javascript:alert(1)"));
        self::assertTrue(HtmlSanitizer::isDangerousUrl("data:text/
html,<b>"));
        self::assertFalse(HtmlSanitizer::isDangerousUrl('https://example.com/javascript:not-a-scheme'));
        self::assertFalse(HtmlSanitizer::isDangerousUrl('/relative/path'));
    }
}
