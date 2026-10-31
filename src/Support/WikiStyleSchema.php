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

namespace Ramon\Avocado\Support;

/**
 * A tabela `avocado_wiki_article_styles` existe neste banco?
 *
 * Mesmo motivo do BookmarksSchema: antes do `migrate` o eager-load derrubaria
 * as páginas do wiki. Sem a tabela todo artigo usa o design padrão.
 */
final class WikiStyleSchema
{
    public const TABLE = 'avocado_wiki_article_styles';

    /**
     * Por nome: o linkrobins/wiki é opcional e não está no composer do tema.
     */
    public const ARTICLE_MODEL = 'LinkRobins\Wiki\WikiArticle';

    public const ARTICLE_RESOURCE = 'LinkRobins\Wiki\Api\Resource\WikiArticleResource';

    private const CACHE_KEY = 'avocado.wiki_styles_table_exists';

    public function __construct(
        private readonly SchemaInspector $schema,
    ) {
    }

    public function available(): bool
    {
        return $this->schema->hasTable(self::TABLE, self::CACHE_KEY);
    }
}
