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

use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Move o caminho do hero de `discussions` (core) para uma tabela companheira,
 * sem coluna nova na tabela do core. Idempotente: cria a tabela, copia os
 * valores só se a coluna antiga existir e então a remove.
 */
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('avocado_discussion_heroes')) {
            $schema->create('avocado_discussion_heroes', function (Blueprint $table) {
                $table->unsignedInteger('discussion_id')->primary();
                $table->string('image_path', 191);
                $table->timestamps();

                $table->foreign('discussion_id')
                    ->references('id')->on('discussions')
                    ->cascadeOnDelete();
            });
        }

        if ($schema->hasColumn('discussions', 'avocado_hero_image_path')) {
            /** @var ConnectionInterface $db */
            $db = $schema->getConnection();

            $db->table('discussions')
                ->whereNotNull('avocado_hero_image_path')
                ->orderBy('id')
                ->chunkById(500, function ($rows) use ($db) {
                    $now = $db->raw('CURRENT_TIMESTAMP');
                    $payload = [];
                    foreach ($rows as $row) {
                        $payload[] = [
                            'discussion_id' => (int) $row->id,
                            'image_path'    => (string) $row->avocado_hero_image_path,
                            'created_at'    => $now,
                            'updated_at'    => $now,
                        ];
                    }
                    if ($payload !== []) {
                        $db->table('avocado_discussion_heroes')->insertOrIgnore($payload);
                    }
                });

            $schema->table('discussions', function (Blueprint $table) {
                $table->dropColumn('avocado_hero_image_path');
            });
        }
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('discussions', 'avocado_hero_image_path')) {
            $schema->table('discussions', function (Blueprint $table) {
                $table->string('avocado_hero_image_path', 191)->nullable()->default(null);
            });
        }

        if ($schema->hasTable('avocado_discussion_heroes')) {
            /** @var ConnectionInterface $db */
            $db = $schema->getConnection();

            $db->table('avocado_discussion_heroes')
                ->orderBy('discussion_id')
                ->chunkById(500, function ($rows) use ($db) {
                    foreach ($rows as $row) {
                        $db->table('discussions')
                            ->where('id', (int) $row->discussion_id)
                            ->update(['avocado_hero_image_path' => $row->image_path]);
                    }
                }, 'discussion_id');

            $schema->drop('avocado_discussion_heroes');
        }
    },
];
