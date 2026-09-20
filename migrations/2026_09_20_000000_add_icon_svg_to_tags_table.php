<?php

use Illuminate\Database\Schema\Builder;

/*
 * Colunas do ícone SVG das tags. Idempotente de propósito: quem já rodou a
 * migration da extensão avulsa `ramon/tag-icon-svg` tem as duas colunas, e o
 * flarum/tags é opcional para o tema, então a tabela pode nem existir.
 */
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('tags')) {
            return;
        }

        $schema->table('tags', function ($table) use ($schema) {
            if (! $schema->hasColumn('tags', 'icon_svg')) {
                $table->mediumText('icon_svg')->nullable();
            }

            if (! $schema->hasColumn('tags', 'icon_svg_mono')) {
                $table->boolean('icon_svg_mono')->default(true);
            }
        });
    },

    // O down não apaga nada: as colunas podem pertencer à extensão avulsa, e
    // derrubá-las levaria embora os SVGs que o admin já cadastrou.
    'down' => function (Builder $schema) {
    },
];
