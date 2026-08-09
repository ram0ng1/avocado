import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';

import { trans, navigate, safeRoute, renderThreadSkeleton, renderLoadMore, renderEmpty } from '../utils';
import { bookmarksEnabled, usesFofBookmarks, bookmarksPageTitle, bookmarksRouteName, fofTrans, BOOKMARKED_FILTER_KEY } from '../utils/bookmarks';
import { toggleDiscussionLike } from '../utils/likes';
import { DISCUSSION_LIST_SORT } from '../utils/sortOptions';

import DiscussionFeedState from '../states/DiscussionFeedState';
import BookmarkedPostListState from '../states/BookmarkedPostListState';

import ThreadCard from './shared/ThreadCard';
import SortDropdown from './shared/SortDropdown';
import PostCard from './shared/PostCard';

type BookmarksTab = 'discussions' | 'posts';

/**
 * Página "Salvos" — a do tema (`/bookmarks`) e, quando o fof/bookmarks está
 * ativo, a dele: index.tsx troca só o componente da rota `fof-bookmarks`, para
 * que a listagem apareça em ThreadCard como no resto do tema em vez do
 * DiscussionListItem do core.
 *
 * As discussões saem da busca com o filtro do provedor no comando
 * (`avocadoBookmarked` ou o `bookmarked` do fof), então paginação, ordenação e
 * card vêm de graça. A aba "Posts" só existe cedendo ao fof — marcar posts é
 * recurso dele. Guests recebem um convite de login: o item de menu só aparece
 * logado, mas a URL é alcançável direto.
 */
export default class BookmarksPage extends Page {
  private feedState!: DiscussionFeedState;
  private postsState?: BookmarkedPostListState;
  private tab: BookmarksTab = 'discussions';
  private likingIds = new Set<string>();

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--index';

    // Sistema desligado no admin: a rota PHP continua existindo, então quem
    // chega por URL direta volta para a home em vez de ver uma página morta.
    if (!bookmarksEnabled()) {
      m.route.set('/');
      return;
    }

    // Define o título no oninit (antes do primeiro render), como o TeamPage —
    // setar no oncreate deixava a aba com o título da página anterior.
    app.setTitle(bookmarksPageTitle());
    app.setTitleCount(0);

    this.tab = this.tabFromRoute();

    if (app.session.user) {
      const sort = m.route.param('sort') || 'latest';
      const filterKey = usesFofBookmarks() ? 'bookmarked' : BOOKMARKED_FILTER_KEY;
      this.feedState = new DiscussionFeedState({ sort, filter: { [filterKey]: true } } as any);
      this.loadCurrentTab();
    }
  }

  /**
   * Trocar de aba é uma mudança de query string na mesma rota, e o Mithril
   * reaproveita a instância sem passar de novo pelo oninit — a aba tem que ser
   * relida a cada draw.
   */
  onbeforeupdate(vnode: any) {
    super.onbeforeupdate(vnode);

    const current = this.tabFromRoute();
    if (current === this.tab) return;

    this.tab = current;
    this.loadCurrentTab();
  }

  view() {
    const homeHref = safeRoute('index');
    const showsTabs = usesFofBookmarks();

    return (
      <div className="AvocadoDiscussions AvocadoBookmarks">
        <div className="AvocadoNav-helper">
          <IndexSidebar />
        </div>

        <div className="AvocadoDiscussions-header">
          <h1 className="AvocadoDiscussions-title">
            <i className="fas fa-bookmark AvocadoBookmarks-titleIcon" aria-hidden="true" />
            {bookmarksPageTitle()}
          </h1>
          {app.session.user && (
            <div className="AvocadoDiscussions-controls">
              {this.tab === 'discussions' && (
                <SortDropdown
                  options={DISCUSSION_LIST_SORT}
                  currentKey={(this.feedState.getParams() as any).sort || 'latest'}
                  onChange={(key: string) => this.feedState.refreshParams({ sort: key } as any, 1)}
                />
              )}
              <a className="AvocadoDiscussions-homeLink" href={homeHref} onclick={(e: Event) => navigate(e as MouseEvent, homeHref)}>
                <i className="fas fa-arrow-left" aria-hidden="true" />
                {trans('ramon-avocado.forum.discussions.home', 'Home')}
              </a>
            </div>
          )}
        </div>

        {app.session.user && showsTabs && this.renderTabs()}

        {!app.session.user ? this.renderGuestPrompt() : this.renderCurrentTab()}
      </div>
    );
  }

  private tabFromRoute(): BookmarksTab {
    return usesFofBookmarks() && m.route.param('tab') === 'posts' ? 'posts' : 'discussions';
  }

  /** Cada lista só é buscada quando a aba é aberta pela primeira vez. */
  private loadCurrentTab(): void {
    if (this.tab === 'discussions') {
      if (!this.feedState.hasItems()) this.feedState.refresh();
      return;
    }

    if (!this.postsState) this.postsState = new BookmarkedPostListState();
    if (this.postsState.isInitialLoading() || this.postsState.hasItems()) return;

    this.postsState.refresh().then(() => m.redraw());
  }

  private renderTabs() {
    const tabs: { key: BookmarksTab; icon: string; label: string }[] = [
      { key: 'discussions', icon: 'far fa-comments', label: fofTrans('page.tab.discussions', 'Discussions') },
      { key: 'posts', icon: 'far fa-comment', label: fofTrans('page.tab.posts', 'Posts') },
    ];

    return (
      <div className="AvocadoBookmarks-tabs" role="tablist">
        {tabs.map((tab) => {
          const active = this.tab === tab.key;
          const href = app.route(bookmarksRouteName(), tab.key === 'discussions' ? {} : { tab: tab.key });

          return (
            <a
              key={tab.key}
              className={`AvocadoBookmarks-tab${active ? ' is-active' : ''}`}
              href={href}
              role="tab"
              aria-selected={active}
              onclick={(e: Event) => navigate(e as MouseEvent, href)}
            >
              <i className={tab.icon} aria-hidden="true" />
              {tab.label}
            </a>
          );
        })}
      </div>
    );
  }

  private renderCurrentTab() {
    return this.tab === 'posts' ? this.renderPosts() : this.renderDiscussions();
  }

  /**
   * Reusa o PostCard compartilhado (o mesmo do perfil e da busca), na mesma
   * pilha da aba de discussões. A PostList do core desenhava o post inteiro —
   * imagem em tamanho original inclusive — e destoava de tudo à volta.
   */
  private renderPosts() {
    const state = this.postsState;
    const posts = (state?.getPages().flatMap((page: any) => page.items) || []) as any[];
    const isLoading = !state || state.isInitialLoading() || state.isLoadingNext();

    if (posts.length === 0) {
      return (
        <div className="AvocadoHome-threadStack">
          {isLoading
            ? renderThreadSkeleton(5)
            : renderEmpty(trans('ramon-avocado.forum.bookmarks.empty_posts', "You haven't bookmarked any posts yet."))}
        </div>
      );
    }

    return (
      <>
        <div className="AvocadoHome-threadStack">
          {posts.map((post: any) => (
            <PostCard key={post.id?.()} post={post} context={this} showBadges={false} />
          ))}
          {isLoading && renderThreadSkeleton(3)}
        </div>

        {!isLoading && state!.hasNext() && renderLoadMore(trans('ramon-avocado.forum.discussions.load_more', 'Load more'), () => state!.loadNext())}
      </>
    );
  }

  private renderGuestPrompt() {
    return (
      <div className="AvocadoBookmarks-guest">
        <i className="far fa-bookmark" aria-hidden="true" />
        <p>{trans('ramon-avocado.forum.bookmarks.guest_prompt', 'Log in to save discussions and find them here later.')}</p>
        <button
          className="Button Button--primary"
          type="button"
          onclick={() => app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'))}
        >
          {trans('ramon-avocado.forum.home.log_in', 'Log In')}
        </button>
      </div>
    );
  }

  private renderDiscussions() {
    const discussions = this.feedState.flatItems();
    const isLoadingNext = this.feedState.isLoadingNext();
    const isInitialLoading = this.feedState.isInitialLoading();

    return (
      <>
        <div className="AvocadoHome-threadStack">
          {discussions.length === 0 && isInitialLoading
            ? renderThreadSkeleton(5)
            : discussions.length === 0
              ? renderEmpty(trans('ramon-avocado.forum.bookmarks.empty', "You haven't saved any discussions yet."))
              : discussions.map((d: any) => (
                  <ThreadCard
                    key={d.id?.()}
                    discussion={d}
                    context={this}
                    likingIds={this.likingIds}
                    showBookmarkMeta={true}
                    onToggleLike={(disc: any) => toggleDiscussionLike(disc, this.likingIds)}
                  />
                ))}
          {discussions.length > 0 && isLoadingNext && renderThreadSkeleton(3)}
        </div>

        {this.feedState.hasNext() &&
          !isLoadingNext &&
          renderLoadMore(trans('ramon-avocado.forum.discussions.load_more', 'Load more'), () => this.feedState.loadNext())}
      </>
    );
  }
}
