<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\Avocado\Tests\unit\Security;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Content\CustomLoadingSpinner;
use ReflectionClass;
use ReflectionMethod;

/**
 * `theme_primary_color` entra cru num <style> do <head>. safeColor() é a
 * allowlist: fora do formato hex/rgb()/rgba() estrito, cai na cor padrão, sem
 * `</style><script>` nem expression()/url(javascript:).
 */
#[Group('security')]
final class LoadingSpinnerColorTest extends TestCase
{
    private const DEFAULT_COLOR = '#5c7cfa';

    private function safeColor(string $raw): string
    {
        $spinner = (new ReflectionClass(CustomLoadingSpinner::class))
            ->newInstanceWithoutConstructor();

        return (string) (new ReflectionMethod(CustomLoadingSpinner::class, 'safeColor'))
            ->invoke($spinner, $raw);
    }

    #[DataProvider('acceptedColors')]
    public function test_well_formed_colours_pass_through(string $color): void
    {
        self::assertSame($color, $this->safeColor($color));
    }

    /** @return array<string, array{0: string}> */
    public static function acceptedColors(): array
    {
        return [
            'short hex'      => ['#fff'],
            'long hex'       => ['#5c7cfa'],
            'hex with alpha' => ['#5c7cfaff'],
            'rgb'            => ['rgb(92, 124, 250)'],
            'rgba'           => ['rgba(92,124,250,0.5)'],
        ];
    }

    #[DataProvider('rejectedColors')]
    public function test_hostile_or_malformed_values_fall_back_to_default(string $raw): void
    {
        self::assertSame(self::DEFAULT_COLOR, $this->safeColor($raw));
    }

    /** @return array<string, array{0: string}> */
    public static function rejectedColors(): array
    {
        return [
            'empty'              => [''],
            'whitespace'         => ['   '],
            'style break-out'    => ['</style><script>alert(1)</script>'],
            'css expression'     => ['expression(alert(1))'],
            'url javascript'     => ['url(javascript:alert(1))'],
            'import'             => ['#fff;@import url(evil)'],
            'named colour'       => ['red'],
            'invalid hex digits' => ['#xyz'],
            'hex too short'      => ['#ff'],
            'rgb non-numeric'    => ['rgb(a,b,c)'],
            'trailing brace'     => ['#fff}body{display:none'],
        ];
    }
}
