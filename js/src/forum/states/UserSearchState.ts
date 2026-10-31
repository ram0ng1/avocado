import app from 'flarum/forum/app';
import type User from 'flarum/common/models/User';

const PAGE_SIZE = 20;

/**
 * Aba "usuários" da busca. Não usa o UserListState do core: é só um
 * `app.store.find('users', { filter: { q } })` com paginação manual.
 */
export default class UserSearchState {
  users: User[] = [];
  loading = false;
  hasMore = false;
  page = 1;

  /** Última busca carregada, para não repetir a mesma chamada. */
  private lastQuery = '';

  /** Carrega a primeira página de `q`; busca vazia zera a lista. */
  load(q: string, page = 1): Promise<void> {
    if (!q) {
      this.users = [];
      this.lastQuery = '';
      this.hasMore = false;
      m.redraw();
      return Promise.resolve();
    }

    this.loading = true;
    this.page = page;
    this.lastQuery = q;
    m.redraw();

    return app.store
      .find<User[]>('users', {
        filter: { q },
        page: { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
      })
      .then((results) => {
        this.users = page === 1 ? results : [...this.users, ...results];
        this.hasMore = results.length >= PAGE_SIZE;
        this.loading = false;
        m.redraw();
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }

  loadNext(): Promise<void> {
    if (!this.lastQuery) return Promise.resolve();
    return this.load(this.lastQuery, this.page + 1);
  }

  /** Buscando, e ainda sem nenhum item. */
  isInitialLoading(): boolean {
    return this.loading && this.users.length === 0;
  }
}
