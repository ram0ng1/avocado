<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Tabela companheira 1:1 com `linkrobins_wiki_articles` para o design que o
 * autor escolhe para o artigo na tela de criação do wiki (o "Manual"). Mesmo
 * desenho da `avocado_changelog_entries`: sem coluna nova na tabela da
 * extensão, e a linha só existe enquanto o artigo não estiver no design padrão.
 *
 * A chave estrangeira só entra se o linkrobins/wiki já tiver criado a tabela
 * dele — o tema não depende da extensão, e o migrate do tema pode rodar antes.
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
