<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

/**
 * Locale parity: every translation key must exist in BOTH en.yml and pt-BR.yml.
 *
 * Companion to the i18n/no-hardcoded-text ESLint rule — that one forces strings
 * through the translator; this one makes sure a key added to one language isn't
 * forgotten in the other (which would render the raw key / English fallback to
 * pt-BR users).
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
