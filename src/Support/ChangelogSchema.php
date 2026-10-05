<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

/**
 * A tabela `avocado_changelog_entries` existe neste banco?
 *
 * Pelo mesmo motivo do BookmarksSchema: o tema chega por `composer update` e a
 * tabela só nasce no `php flarum migrate` seguinte. Nessa janela o eager-load de
 * `avocadoChangelog` rodaria em TODA listagem de discussões e derrubaria o fórum
 * com "Base table or view not found". Sem a tabela, a versão e a capa do
 * changelog só ficam fora do ar (campos ocultos e não graváveis); rodar as
 * migrations religa tudo. Cache e memo: ver SchemaInspector.
 */
final class ChangelogSchema
{
    public const TABLE = 'avocado_changelog_entries';

    private const CACHE_KEY = 'avocado.changelog_table_exists';

    public function __construct(
        private readonly SchemaInspector $schema,
    ) {
    }

    public function available(): bool
    {
        return $this->schema->hasTable(self::TABLE, self::CACHE_KEY);
    }
}
