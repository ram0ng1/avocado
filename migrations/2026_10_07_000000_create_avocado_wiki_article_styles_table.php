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
 * Design escolhido para cada artigo do linkrobins/wiki (tabela companheira 1:1).
 * A chave estrangeira só entra se a tabela do wiki já existir: o tema não
 * depende da extensão e pode migrar antes dela.
 */
return [
    'up' => function (Builder $schema) {
        if ($schema->hasTable('avocado_wiki_article_styles')) {
            return;
        }

        $schema->create('avocado_wiki_article_styles', function (Blueprint $table) use ($schema) {
            $table->unsignedInteger('article_id')->primary();
            $table->string('style', 16);
            $table->timestamps();

            if ($schema->hasTable('linkrobins_wiki_articles')) {
                $table->foreign('article_id')
                    ->references('id')->on('linkrobins_wiki_articles')
                    ->cascadeOnDelete();
            }
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('avocado_wiki_article_styles');
    },
];
