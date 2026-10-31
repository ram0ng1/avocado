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

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/*
 * `cover` passa a guardar `tags:12,15,18` e `preset:sunset`, que não cabem em 16.
 * Idempotente: em instalações novas a coluna já nasce com 64.
 */
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('avocado_changelog_entries')) {
            return;
        }

        $schema->table('avocado_changelog_entries', function (Blueprint $table) {
            $table->string('cover', 64)->nullable()->change();
        });
    },

    // O down não encolhe a coluna: valores maiores que 16 seriam truncados ou recusados.
    'down' => function (Builder $schema) {
    },
];
