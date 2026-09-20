<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Support\SvgIconSanitizer;

/**
 * SvgIconSanitizer limpa o SVG que um admin cola no modal "Editar tag" antes de
 * ele ser embutido no HTML de toda página. Complementa o SvgSanitizerTest, que
 * cobre o mesmo risco no upload do logo.
 */
#[Group('security')]
final class SvgIconSanitizerTest extends TestCase
{
    private const NS = 'xmlns="http://www.w3.org/2000/svg"';

    public function testKeepsPlainShapes(): void
    {
        $out = SvgIconSanitizer::sanitize('<svg '.self::NS.' viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');

        $this->assertNotNull($out);
        $this->assertStringContainsString('<path d="M0 0h24v24H0z"', $out);
        $this->assertStringContainsString('viewBox="0 0 24 24"', $out);
    }

    public function testDropsScriptsAndForeignObject(): void
    {
        $out = SvgIconSanitizer::sanitize(
            '<svg '.self::NS.' viewBox="0 0 1 1"><script>alert(1)</script>'
            .'<foreignObject><div>x</div></foreignObject><rect width="1" height="1"/></svg>'
        );

        $this->assertNotNull($out);
        $this->assertStringNotContainsStringIgnoringCase('script', $out);
        $this->assertStringNotContainsStringIgnoringCase('foreignObject', $out);
        $this->assertStringContainsString('<rect', $out);
    }

    public function testStripsEventHandlersAndJavascriptUrls(): void
    {
        $out = SvgIconSanitizer::sanitize(
            '<svg '.self::NS.' xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1" onload="alert(1)">'
            .'<a xlink:href="javascript:alert(1)"><rect width="1" height="1" onclick="alert(2)"/></a></svg>'
        );

        // `a` não está na lista de elementos permitidos, então some com o href.
        $this->assertNotNull($out);
        $this->assertStringNotContainsStringIgnoringCase('onload', $out);
        $this->assertStringNotContainsStringIgnoringCase('onclick', $out);
        $this->assertStringNotContainsStringIgnoringCase('javascript:', $out);
    }

    /**
     * <title>/<desc> são "HTML integration points": embutido numa página, o que
     * está dentro deles é lido pelo parser de HTML. Um <style> ali vira RAWTEXT, e
     * o CDATA com que o sanitizador embrulha o CSS deixaria `</style><img onerror>`
     * literal — fechando o elemento e criando um <img> executável.
     */
    public function testTitleAndDescKeepOnlyText(): void
    {
        $out = SvgIconSanitizer::sanitize(
            '<svg '.self::NS.' viewBox="0 0 1 1">'
            .'<title>Raio<style><![CDATA[</style><img src=x onerror=alert(1)>]]></style></title>'
            .'<desc><g><style>.a{fill:red}</style></g>icone</desc>'
            .'<rect width="1" height="1"/></svg>'
        );

        $this->assertNotNull($out);
        $this->assertStringNotContainsStringIgnoringCase('onerror', $out);
        $this->assertStringNotContainsStringIgnoringCase('<img', $out);
        $this->assertStringNotContainsStringIgnoringCase('<style', $out);
        $this->assertStringContainsString('<title>Raio</title>', $out, 'o texto do título fica');
        $this->assertStringContainsString('<rect', $out);
    }

    public function testDropsStylesheetThatTriesToCloseItself(): void
    {
        $out = SvgIconSanitizer::sanitize(
            '<svg '.self::NS.' viewBox="0 0 1 1">'
            .'<style><![CDATA[.a{fill:red}</style><img src=x onerror=alert(1)>]]></style>'
            .'<rect class="a" width="1" height="1"/></svg>'
        );

        $this->assertNotNull($out);
        $this->assertStringNotContainsStringIgnoringCase('onerror', $out);
        $this->assertStringNotContainsStringIgnoringCase('<style', $out);
        $this->assertStringContainsString('<rect', $out);
    }

    public function testRemovesExternalHrefButKeepsLocalReferences(): void
    {
        $out = SvgIconSanitizer::sanitize(
            '<svg '.self::NS.' xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1">'
            .'<defs><path id="p" d="M0 0h1v1z"/></defs>'
            .'<use xlink:href="#p"/><use xlink:href="https://evil.test/x.svg#p"/></svg>'
        );

        $this->assertNotNull($out);
        $this->assertStringNotContainsString('evil.test', $out);
        $this->assertStringContainsString('#p-', $out, 'a referência local segue o id renomeado');
    }

    public function testRejectsEntityDeclarations(): void
    {
        $xxe = '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg '.self::NS.'><text>&x;</text></svg>';

        $this->assertNull(SvgIconSanitizer::sanitize($xxe));
    }

    public function testRejectsNonSvgAndOversizedInput(): void
    {
        $this->assertNull(SvgIconSanitizer::sanitize(''));
        $this->assertNull(SvgIconSanitizer::sanitize('<html><body>oi</body></html>'));
        $this->assertNull(SvgIconSanitizer::sanitize(str_repeat('a', SvgIconSanitizer::MAX_BYTES + 1)));
    }

    public function testDerivesViewBoxAndDropsFixedSize(): void
    {
        $out = SvgIconSanitizer::sanitize('<svg '.self::NS.' width="48" height="24"><rect width="48" height="24"/></svg>');

        $this->assertNotNull($out);
        $this->assertStringContainsString('viewBox="0 0 48 24"', $out);
        $this->assertDoesNotMatchRegularExpression('/<svg[^>]*\swidth=/', $out);
    }

    public function testScopesIdsPerIconSoTwoIconsDoNotClash(): void
    {
        $one = SvgIconSanitizer::sanitize('<svg '.self::NS.' viewBox="0 0 1 1"><defs><linearGradient id="a"/></defs><rect fill="url(#a)"/></svg>');
        $two = SvgIconSanitizer::sanitize('<svg '.self::NS.' viewBox="0 0 2 2"><defs><linearGradient id="a"/></defs><rect fill="url(#a)"/></svg>');

        $this->assertNotNull($one);
        $this->assertNotNull($two);
        $this->assertDoesNotMatchRegularExpression('/id="a"/', $one);

        preg_match('/id="(a-[0-9a-f]+)"/', $one, $first);
        preg_match('/id="(a-[0-9a-f]+)"/', $two, $second);

        $this->assertNotSame($first[1], $second[1]);
        $this->assertStringContainsString('url(#'.$first[1].')', $one);
    }

    public function testMovesStyleFillOntoAttributesSoMonochromeCanOverrideIt(): void
    {
        $out = SvgIconSanitizer::sanitize('<svg '.self::NS.' viewBox="0 0 1 1"><path d="M0 0h1v1z" style="fill:#ff0000"/></svg>');

        $this->assertNotNull($out);
        $this->assertStringContainsString('fill="#ff0000"', $out);
        $this->assertStringNotContainsString('style=', $out);
    }
}
