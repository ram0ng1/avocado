<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Tabela companheira que guarda os bookmarks (discussões salvas) por usuário
 * (CLAUDE.md §45 — nada vai na `discussion_user`/core). O índice único
 * (user_id, discussion_id) impede duplicatas e serve as três rotas de acesso:
 * listar os salvos do ator, o exists() por-ator no filtro de busca e o
 * eager-load escopado ao ator que alimenta o campo `bookmarked`.
 */
return [
    'up' => function (Builder $schema) {
        if ($schema->hasTable('avocado_bookmarks')) {
            return;
        }

        $schema->create('avocado_bookmarks', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->unsignedInteger('discussion_id');
            $table->timestamp('created_at')->nullable();

            $table->unique(['user_id', 'discussion_id'], 'avocado_bookmarks_user_discussion_unique');

            $table->foreign('user_id')
                ->references('id')->on('users')
                ->cascadeOnDelete();
            $table->foreign('discussion_id')
                ->references('id')->on('discussions')
                ->cascadeOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('avocado_bookmarks');
    },
];
