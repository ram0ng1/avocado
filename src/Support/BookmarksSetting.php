<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Flarum\Settings\SettingsRepositoryInterface;

/**
 * Leitura canônica do switch do sistema de bookmarks. Centraliza o cast — o
 * settings guarda '0'/'1' como string e `(bool) '0'` é true em PHP, então todo
 * consumidor passa por aqui em vez de coagir por conta própria.
 */
class BookmarksSetting
{
    public static function enabled(SettingsRepositoryInterface $settings): bool
    {
        $value = $settings->get('avocado.bookmarks_enabled', true);

        return $value === null ? true : (bool) filter_var($value, FILTER_VALIDATE_BOOL);
    }
}
