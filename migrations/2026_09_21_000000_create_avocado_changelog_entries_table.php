<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Tabela companheira 1:1 com `discussions` para os dados de uma versão do
 * changelog que não cabem na discussão: o número da versão e o tipo de capa.
 * Mesmo desenho da `avocado_discussion_heroes` — sem coluna nova na tabela do
 * core — e a linha só existe enquanto houver algo a guardar.
 */
return [
    'up' => function (Builder $schema) {
        if ($schema->hasTable('avocado_changelog_entries')) {
            return;
        }

        $schema->create('avocado_changelog_entries', function (Blueprint $table) {
            $table->unsignedInteger('discussion_id')->primary();
            $table->string('version', 32)->nullable();
            $table->string('cover', 64)->nullable();
            $table->timestamps();

            $table->foreign('discussion_id')
                ->references('id')->on('discussions')
                ->cascadeOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('avocado_changelog_entries');
    },
];
