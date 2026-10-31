<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

use Illuminate\Database\Schema\Builder;

/*
 * Tamanho do ícone SVG da tag, em % do glifo: muito SVG traz folga no viewBox e
 * sai miúdo ao lado dos ícones Font Awesome. Idempotente.
 */
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('tags') || $schema->hasColumn('tags', 'icon_svg_scale')) {
            return;
        }

        $schema->table('tags', function ($table) {
            $table->unsignedSmallInteger('icon_svg_scale')->default(100);
        });
    },

    // Só o tema conhece esta coluna (a extensão avulsa não), então o down pode removê-la.
    'down' => function (Builder $schema) {
        if (! $schema->hasTable('tags') || ! $schema->hasColumn('tags', 'icon_svg_scale')) {
            return;
        }

        $schema->table('tags', function ($table) {
            $table->dropColumn('icon_svg_scale');
        });
    },
];
