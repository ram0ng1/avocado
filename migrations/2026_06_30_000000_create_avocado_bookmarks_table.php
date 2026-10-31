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

/**
 * Bookmarks por usuário em tabela própria, fora da `discussion_user` do core.
 * O índice único (user_id, discussion_id) impede duplicatas e serve todas as
 * consultas, sempre escopadas ao ator.
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
