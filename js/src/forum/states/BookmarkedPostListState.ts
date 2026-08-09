import PostListState from 'flarum/forum/states/PostListState';
import type { PaginatedListRequestParams } from 'flarum/common/states/PaginatedListState';

const PAGE_SIZE = 20;

/**
 * Lista paginada dos posts marcados pelo ator, mais recentes primeiro. Só existe
 * no modo fof/bookmarks — é a extensão que marca posts; o sistema próprio do
 * tema é só de discussões.
 *
 * Espelha o BookmarkedPostListState do fof/bookmarks de propósito: a aba "Posts"
 * da página tem que trazer exatamente o que a página original dele traria. O
 * `filter.type: 'comment'` e o `sort: '-createdAt'` já vêm do PostListState do
 * core.
 */
export default class BookmarkedPostListState extends PostListState {
  constructor() {
    // O core tipa valores de filtro como string e serializa na query de todo
    // jeito, então a flag vai como '1' em vez de booleano.
    super({ filter: { bookmarked: '1' } }, 1, PAGE_SIZE);
  }

  requestParams(): PaginatedListRequestParams {
    const params = super.requestParams();

    // Nenhum `include` é enviado de propósito: um include do cliente SUBSTITUI o
    // defaultInclude do endpoint (json-api-server, IncludesData::getInclude()).
    // Mandar o ['user','discussion'] do core derrubaria o resto dos defaults do
    // Index (user.groups, editedUser, hiddenUser) e tudo que outras extensões
    // acrescentam, que passariam a renderizar sobre relação não carregada.
    delete params.include;

    return params;
  }
}
