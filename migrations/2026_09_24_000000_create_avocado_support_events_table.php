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
 * Linha do tempo de status dos tickets do linkrobins/support, que não guarda
 * histórico próprio. Tabela companheira: não toca no schema da extensão e é
 * criada mesmo com ela desligada.
 */
return [
    'up' => function (Builder $schema) {
        if ($schema->hasTable('avocado_support_events')) {
            return;
        }

        $schema->create('avocado_support_events', function (Blueprint $table) use ($schema) {
            $table->increments('id');
            $table->unsignedInteger('ticket_id');
            $table->unsignedInteger('user_id')->nullable();
            $table->string('type', 32)->default('status');
            $table->string('from_status', 32)->nullable();
            $table->string('to_status', 32)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['ticket_id', 'created_at']);

            // A chave estrangeira só entra quando a tabela da extensão existe;
            // sem ela a tabela nasce solta e o vínculo é feito pelo índice.
            if ($schema->hasTable('linkrobins_support_tickets')) {
                $table->foreign('ticket_id')
                    ->references('id')->on('linkrobins_support_tickets')
                    ->cascadeOnDelete();
            }

            $table->foreign('user_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('avocado_support_events');
    },
];
