import app from 'flarum/forum/app';
import type User from 'flarum/common/models/User';

const PAGE_SIZE = 20;

/**
 * State for the "users" tab of the unified search page.
 *
 * Avocado doesn't reuse `flarum/forum/states/UserListState` here because
 * the tab is a thin wrapper around `app.store.find('users', { filter: { q } })`
 * with manual pagination — no sort modes, no gambits.
 */
export default class UserSearchState {
  users: User[] = [];
  loading = false;
  hasMore = false;
  page = 1;

  /** Last query the state was loaded with — used to short-circuit repeated calls. */
  private lastQuery = '';

  /**
   * Load the first page of results for `q`. Empty queries reset the list.
   * Returns the same promise so callers can chain `.then()` for tests.
   */
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

  /** Load the next page using the most-recent query. */
  loadNext(): Promise<void> {
    if (!this.lastQuery) return Promise.resolve();
    return this.load(this.lastQuery, this.page + 1);
  }

  /** True while a fetch is in flight and no items have been received yet. */
  isInitialLoading(): boolean {
    return this.loading && this.users.length === 0;
  }
}
