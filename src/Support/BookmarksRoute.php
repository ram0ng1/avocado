<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

/**
 * Onde a página "Salvos" do Avocado atende — e quando ela simplesmente não existe.
 *
 * O fof/bookmarks é um sistema de bookmarks dedicado e registra a MESMA rota de
 * frontend `/bookmarks`. Duas rotas GET no mesmo path fazem o FastRoute abortar
 * ao compilar a tabela de rotas (BadRouteException) e o fórum inteiro deixa de
 * subir — era isso que derrubava a instalação ao ativar o tema com a extensão
 * presente.
 *
 * Com ela ativa o tema cede o sistema inteiro: a rota, os campos de API e o
 * eager-load do bookmark do Avocado saem do ar (ver extend.php), e o botão de
 * salvar do card passa a gravar na extensão. A tabela `avocado_bookmarks` fica
 * dormente, intacta, e volta a valer se o fof for desativado.
 */
final class BookmarksRoute
{
    /** Nome da rota — igual nos dois lados (app.routes['avocado-bookmarks']). */
    public const ROUTE_NAME = 'avocado-bookmarks';

    /** Path da página. O JS repete a constante em utils/bookmarks (BOOKMARKS_PATH). */
    public const PATH = '/bookmarks';

    public const CONFLICTING_EXTENSION_ID = 'fof-bookmarks';
}
