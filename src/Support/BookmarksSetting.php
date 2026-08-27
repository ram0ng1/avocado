<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Flarum\Settings\SettingsRepositoryInterface;

/**
 * Leitura canônica do switch do sistema de bookmarks. Centraliza o cast — o
 * settings guarda '0'/'1' como string e `(bool) '0'` é true em PHP, então todo
 * consumidor passa por aqui em vez de coagir por conta própria.
 *
 * A tabela entra na conta junto com o switch: sem `avocado_bookmarks` migrada
 * não existe sistema de bookmarks para ligar, e todo consumidor (controllers,
 * filtro, campos da API, comando de lembretes) já passa por aqui — um único
 * ponto cobre todos. Ver BookmarksSchema.
 */
class BookmarksSetting
{
    public static function enabled(SettingsRepositoryInterface $settings): bool
    {
        $value = $settings->get('avocado.bookmarks_enabled', true);
        $enabled = $value === null ? true : (bool) filter_var($value, FILTER_VALIDATE_BOOL);

        return $enabled && BookmarksSchema::available();
    }
}
