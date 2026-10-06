<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

/**
 * A tabela `avocado_wiki_article_styles` existe neste banco?
 *
 * Pelo mesmo motivo do ChangelogSchema: o tema chega por `composer update` e a
 * tabela só nasce no `php flarum migrate` seguinte. Nessa janela o eager-load
 * de `avocadoStyle` nos artigos do wiki derrubaria o índice e cada artigo com
 * "Base table or view not found". Sem a tabela, a escolha de design só fica
 * fora do ar (campo oculto e não gravável) e todo artigo usa o padrão.
 */
final class WikiStyleSchema
{
    public const TABLE = 'avocado_wiki_article_styles';

    /**
     * Classes do linkrobins/wiki, por nome: a extensão é opcional para o tema e
     * não está no composer dele (nem no CI), então o extend.php não pode citá-las
     * com `::class` — mesmo arranjo do SupportEvents::TICKET_MODEL.
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
