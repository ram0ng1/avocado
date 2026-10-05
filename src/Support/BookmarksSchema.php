<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

/**
 * A tabela `avocado_bookmarks` existe neste banco?
 *
 * Parece supérfluo — a migration cria a tabela —, mas entre o `composer update`
 * e o `php flarum migrate` o eager-load do bookmark rodava em TODA listagem de
 * discussões e derrubava o fórum inteiro com "Base table or view not found:
 * 1146 avocado_bookmarks doesn't exist" — a home quebrava por causa de um
 * recurso opcional que o admin nem tinha migrado. O mesmo vale para quem
 * restaura um dump anterior à migration.
 *
 * Sem a tabela, o sistema de bookmarks só fica desligado (BookmarksSetting
 * devolve false e o eager-load some do endpoint); rodar as migrations religa.
 * Cache e memo: ver SchemaInspector.
 */
final class BookmarksSchema
{
    public const TABLE = 'avocado_bookmarks';

    private const CACHE_KEY = 'avocado.bookmarks_table_exists';

    public function __construct(
        private readonly SchemaInspector $schema,
    ) {
    }

    public function available(): bool
    {
        return $this->schema->hasTable(self::TABLE, self::CACHE_KEY);
    }
}
