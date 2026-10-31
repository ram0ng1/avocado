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
 * Onde a página "Salvos" do Avocado atende — e quando ela simplesmente não existe.
 *
 * O fof/bookmarks registra a mesma rota `/bookmarks`, e duas rotas GET iguais
 * derrubam o boot (FastRoute\BadRouteException). Com ele ativo o tema cede o
 * sistema inteiro; a tabela `avocado_bookmarks` fica intacta para quando ele sair.
 */
final class BookmarksRoute
{
    /** Nome da rota — igual nos dois lados (app.routes['avocado-bookmarks']). */
    public const ROUTE_NAME = 'avocado-bookmarks';

    /** Path da página. O JS repete a constante em utils/bookmarks (BOOKMARKS_PATH). */
    public const PATH = '/bookmarks';

    public const CONFLICTING_EXTENSION_ID = 'fof-bookmarks';
}
