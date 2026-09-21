<?php

use Illuminate\Database\Schema\Builder;

/*
 * Tamanho do ícone SVG de uma tag, em porcentagem do glifo (100 = o mesmo espaço
 * de um ícone Font Awesome). Existe porque muito SVG traz folga dentro do viewBox
 * e sai miúdo ao lado dos outros. Idempotente, como a migration das outras colunas.
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

    // Ao contrário de `icon_svg`, esta coluna é só do tema (a extensão avulsa não a
    // conhece), então o down pode levá-la embora.
    'down' => function (Builder $schema) {
        if (! $schema->hasTable('tags') || ! $schema->hasColumn('tags', 'icon_svg_scale')) {
            return;
        }

        $schema->table('tags', function ($table) {
            $table->dropColumn('icon_svg_scale');
        });
    },
];
