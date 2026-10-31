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
 * A tabela `avocado_changelog_entries` existe neste banco?
 *
 * Mesmo motivo do BookmarksSchema: antes do `migrate` o eager-load derrubaria
 * toda listagem. Sem a tabela, versão e capa só ficam fora do ar.
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
