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
 * A tabela `avocado_bookmarks` existe neste banco?
 *
 * Entre o `composer update` e o `migrate` (ou num dump antigo) o eager-load
 * derrubaria toda listagem com "Base table or view not found". Sem a tabela os
 * bookmarks só ficam desligados. Cache e memo: ver SchemaInspector.
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
