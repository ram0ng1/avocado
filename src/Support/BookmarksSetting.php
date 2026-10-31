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

namespace Ramon\Avocado\Support;

use Flarum\Settings\SettingsRepositoryInterface;

/**
 * Leitura única do switch dos bookmarks: o settings guarda '0'/'1' como string,
 * e `(bool) '0'` é true. Sem a tabela migrada o switch conta como desligado.
 */
final class BookmarksSetting
{
    public function __construct(
        private readonly SettingsRepositoryInterface $settings,
        private readonly BookmarksSchema $schema,
    ) {
    }

    public function enabled(): bool
    {
        $value = $this->settings->get('avocado.bookmarks_enabled', true);
        $enabled = $value === null ? true : (bool) filter_var($value, FILTER_VALIDATE_BOOL);

        return $enabled && $this->schema->available();
    }
}
