<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Support\LogoViewBox;

/**
 * O viewBox medido no admin vai parar dentro de um <script> em toda página:
 * só passa se for do arquivo atual e se for exatamente quatro números.
 */
final class LogoViewBoxTest extends TestCase
{
    public function test_returns_the_view_box_of_the_current_file(): void
    {
        $stored = json_encode(['path' => 'avocado-logo-a.svg', 'viewBox' => '-4.6725 18.1775 165.095 51.895']);

        $this->assertSame('-4.6725 18.1775 165.095 51.895', LogoViewBox::forPath((string) $stored, 'avocado-logo-a.svg'));
    }

    public function test_ignores_a_measure_taken_from_another_file(): void
    {
        // Logo trocado: o viewBox antigo não vale para o arquivo novo.
        $stored = json_encode(['path' => 'avocado-logo-old.svg', 'viewBox' => '0 0 10 10']);

        $this->assertNull(LogoViewBox::forPath((string) $stored, 'avocado-logo-new.svg'));
    }

    public function test_ignores_empty_or_malformed_settings(): void
    {
        $this->assertNull(LogoViewBox::forPath('', 'a.svg'));
        $this->assertNull(LogoViewBox::forPath('{not json', 'a.svg'));
        $this->assertNull(LogoViewBox::forPath('{"path":"a.svg"}', 'a.svg'));
        $this->assertNull(LogoViewBox::forPath('{"path":"a.svg","viewBox":["0","0","1","1"]}', 'a.svg'));
        $this->assertNull(LogoViewBox::forPath('{"path":"a.svg","viewBox":"0 0 1 1"}', ''));
    }

    /** @return iterable<string, array{string, string|null}> */
    public static function viewBoxes(): iterable
    {
        yield 'inteiros' => ['0 0 100 50', '0 0 100 50'];
        yield 'negativos e decimais' => ['-4.672499999999999 18.177500381469727 165.095 51.89500305175781', '-4.672499999999999 18.177500381469727 165.095 51.89500305175781'];
        yield 'notação exponencial do JS' => ['1e-7 -2.5E+3 10 .5', '1e-7 -2.5E+3 10 .5'];
        yield 'espaços nas pontas' => ['  0 0 1 1 ', '0 0 1 1'];
        yield 'largura zero' => ['0 0 0 10', null];
        yield 'altura negativa' => ['0 0 10 -1', null];
        yield 'três números' => ['0 0 10', null];
        yield 'vírgulas' => ['0,0,10,10', null];
        yield 'injeção' => ['0 0 1 1";alert(1)//', null];
        yield 'fecha script' => ['0 0 1 1</script>', null];
        yield 'infinito' => ['0 0 1e999 1', null];
    }

    #[DataProvider('viewBoxes')]
    public function test_normalize(string $input, ?string $expected): void
    {
        $this->assertSame($expected, LogoViewBox::normalize($input));
    }
}
