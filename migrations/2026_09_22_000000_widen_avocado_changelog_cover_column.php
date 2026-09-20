<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/*
 * `cover` nasceu com 16 caracteres, o bastante para "color". Agora guarda também
 * `tags:12,15,18` e `preset:sunset`, então cabe 64. Idempotente: em instalações
 * novas a tabela já nasce com 64 e este `change()` é um no-op.
 */
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('avocado_changelog_entries')) {
            return;
        }

        $schema->table('avocado_changelog_entries', function (Blueprint $table) {
            $table->string('cover', 64)->nullable()->change();
        });
    },

    // O down não encolhe a coluna: valores maiores que 16 seriam truncados ou recusados.
    'down' => function (Builder $schema) {
    },
];
