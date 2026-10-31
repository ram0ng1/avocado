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

namespace Ramon\Avocado\Tests\unit;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

/**
 * Toda chave de tradução precisa existir no en.yml E no pt-BR.yml, senão um dos
 * idiomas mostra a chave crua ou o fallback.
 */
final class LocaleParityTest extends TestCase
{
    private const LOCALES = ['en', 'pt-BR'];

    /** @return list<string> sorted dot-keys of every leaf string in the file */
    private function keysOf(string $locale): array
    {
        $path = dirname(__DIR__, 2) . "/locale/$locale.yml";
        $keys = $this->flatten((array) Yaml::parseFile($path));
        sort($keys);

        return $keys;
    }

    /**
     * @param  array<string, mixed> $data
     * @return list<string>
     */
    private function flatten(array $data, string $prefix = ''): array
    {
        $keys = [];
        foreach ($data as $key => $value) {
            $dotted = $prefix === '' ? (string) $key : "$prefix.$key";
            if (is_array($value)) {
                $keys = array_merge($keys, $this->flatten($value, $dotted));
            } else {
                $keys[] = $dotted;
            }
        }

        return $keys;
    }

    public function test_pt_br_translates_every_en_key(): void
    {
        $missing = array_values(array_diff($this->keysOf('en'), $this->keysOf('pt-BR')));

        self::assertSame(
            [],
            $missing,
            "pt-BR.yml is missing these keys (untranslated):\n  - " . implode("\n  - ", $missing)
        );
    }

    public function test_en_has_no_stale_keys_absent_from_pt_br(): void
    {
        $extra = array_values(array_diff($this->keysOf('pt-BR'), $this->keysOf('en')));

        self::assertSame(
            [],
            $extra,
            "pt-BR.yml has keys not present in en.yml (stale or misplaced):\n  - " . implode("\n  - ", $extra)
        );
    }

    public function test_every_declared_locale_file_parses(): void
    {
        foreach (self::LOCALES as $locale) {
            self::assertNotEmpty($this->keysOf($locale), "$locale.yml parsed to zero keys");
        }
    }
}
