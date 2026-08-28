<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Api\DiscussionFields;
use ReflectionClass;

/**
 * `avocadoExcerpt` roda para cada linha de um payload de Index: um post cujo XML
 * o redutor não soubesse tratar derrubava a listagem inteira com 500, não só o
 * card daquela discussão. Estes testes fixam o contrato — texto corrido, sem
 * citação, sem imagem, e null (nunca exceção) para entrada estranha.
 *
 * `plainExcerpt()` é privado e puro (string → ?string), então é chamado por
 * reflexão: não precisa de container, disco nem modelo carregado.
 */
final class DiscussionExcerptTest extends TestCase
{
    private static function excerpt(string $xml): ?string
    {
        $fields = (new ReflectionClass(DiscussionFields::class))->newInstanceWithoutConstructor();

        $method = new \ReflectionMethod(DiscussionFields::class, 'plainExcerpt');

        /** @var string|null $result */
        $result = $method->invoke($fields, $xml);

        return $result;
    }

    public function test_plain_text_post_is_returned_as_is(): void
    {
        self::assertSame('Bom dia a todos', self::excerpt('<t>Bom dia a todos</t>'));
    }

    public function test_markup_tags_are_dropped_but_text_is_kept(): void
    {
        // <s>/<e> são os próprios asteriscos do negrito na representação do s9e.
        $xml = '<r>Isto é <STRONG><s>**</s>importante<e>**</e></STRONG> mesmo</r>';

        self::assertSame('Isto é importante mesmo', self::excerpt($xml));
    }

    public function test_quote_content_is_not_part_of_the_excerpt(): void
    {
        $xml = '<r><QUOTE><i>&gt; </i><p>texto citado</p></QUOTE><p>minha resposta</p></r>';

        self::assertSame('minha resposta', self::excerpt($xml));
    }

    /**
     * O caso que gerava o TypeError: o `.*?</QUOTE>` casava até o fechamento da
     * citação interna e deixava o `</QUOTE>` externo órfão, o XML resultante não
     * carregava e `removeFormatting()` devolvia null.
     */
    public function test_nested_quotes_do_not_break_the_excerpt(): void
    {
        $xml = '<r><QUOTE><i>&gt; </i><QUOTE><i>&gt;&gt; </i><p>citação de dentro</p></QUOTE>'
            . '<p>citação de fora</p></QUOTE><p>resposta final</p></r>';

        self::assertSame('resposta final', self::excerpt($xml));
    }

    #[DataProvider('imageMarkup')]
    public function test_image_urls_never_leak_into_the_excerpt(string $image): void
    {
        $excerpt = self::excerpt('<r><p>antes</p>' . $image . '<p>depois</p></r>');

        self::assertSame('antes depois', $excerpt);
        self::assertStringNotContainsString('http', (string) $excerpt);
    }

    /** @return array<string, array{0: string}> */
    public static function imageMarkup(): array
    {
        return [
            'IMG vazio' => ['<IMG src="https://exemplo.test/foto.png">https://exemplo.test/foto.png</IMG>'],
            'IMG auto-fechado' => ['<IMG src="https://exemplo.test/foto.png"/>'],
            'anexo do fof-upload' => ['<UPL-IMAGE-PREVIEW url="https://exemplo.test/anexo.webp">https://exemplo.test/anexo.webp</UPL-IMAGE-PREVIEW>'],
        ];
    }

    public function test_whitespace_is_collapsed_into_single_spaces(): void
    {
        self::assertSame('linha um linha dois', self::excerpt("<t>linha um\n\n  linha dois</t>"));
    }

    public function test_excerpt_is_capped(): void
    {
        $excerpt = self::excerpt('<t>' . str_repeat('a', 500) . '</t>');

        self::assertSame(300, mb_strlen((string) $excerpt));
    }

    public function test_post_with_only_a_quote_has_no_excerpt(): void
    {
        $xml = '<r><QUOTE><i>&gt; </i><p>só a citação</p></QUOTE></r>';

        self::assertNull(self::excerpt($xml));
    }

    #[DataProvider('unusableContent')]
    public function test_content_that_cannot_be_parsed_yields_null(string $xml): void
    {
        self::assertNull(self::excerpt($xml));
    }

    /** @return array<string, array{0: string}> */
    public static function unusableContent(): array
    {
        return [
            'vazio' => [''],
            'só espaços' => ['<t>   </t>'],
            'tag desbalanceada' => ['<r><QUOTE><p>órfã</r>'],
            'não é XML' => ['isto não é xml <<< nem perto'],
        ];
    }
}
