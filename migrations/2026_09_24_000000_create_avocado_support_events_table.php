<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Linha do tempo de um ticket do linkrobins/support: cada mudança de status
 * vira uma linha aqui, com quem mudou e quando. A extensão só dispara a
 * notificação e segue; sem esta tabela a página do ticket não teria como
 * mostrar "fulano marcou como resolvido" entre as respostas, como a discussão
 * mostra os event posts dela.
 *
 * Tabela companheira da tabela da extensão (CLAUDE.md §45): some junto com o
 * ticket pela chave estrangeira e não toca no schema dela. Criada mesmo com a
 * extensão desligada — a migration é do tema — e fica vazia até ela existir.
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
