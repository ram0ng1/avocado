<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Nota e lembrete por bookmark (estilo Discourse). `remind_at` é o instante
 * escolhido pelo usuário; `reminder_sent_at` marca o envio e impede reenvio —
 * o scheduler busca `remind_at <= now AND reminder_sent_at IS NULL`, coberto
 * pelo índice em `remind_at` (o filtro por NULL é resolvido na própria linha).
 */
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('avocado_bookmarks')) {
            return;
        }

        $schema->table('avocado_bookmarks', function (Blueprint $table) use ($schema) {
            if (! $schema->hasColumn('avocado_bookmarks', 'note')) {
                $table->text('note')->nullable();
            }
            if (! $schema->hasColumn('avocado_bookmarks', 'remind_at')) {
                $table->dateTime('remind_at')->nullable()->index('avocado_bookmarks_remind_at_index');
            }
            if (! $schema->hasColumn('avocado_bookmarks', 'reminder_sent_at')) {
                $table->dateTime('reminder_sent_at')->nullable();
            }
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasTable('avocado_bookmarks')) {
            return;
        }

        $schema->table('avocado_bookmarks', function (Blueprint $table) use ($schema) {
            if ($schema->hasColumn('avocado_bookmarks', 'remind_at')) {
                $table->dropIndex('avocado_bookmarks_remind_at_index');
            }

            $drop = array_values(array_filter(
                ['note', 'remind_at', 'reminder_sent_at'],
                fn (string $col) => $schema->hasColumn('avocado_bookmarks', $col)
            ));

            if ($drop !== []) {
                $table->dropColumn($drop);
            }
        });
    },
];
