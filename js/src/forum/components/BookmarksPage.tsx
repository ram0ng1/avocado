import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';

import { trans, navigate, safeRoute, renderThreadSkeleton, renderLoadMore, renderEmpty } from '../utils';
import { bookmarksEnabled } from '../utils/bookmarks';
import { toggleDiscussionLike } from '../utils/likes';
import { DISCUSSION_LIST_SORT } from '../utils/sortOptions';

import DiscussionFeedState from '../states/DiscussionFeedState';

import ThreadCard from './shared/ThreadCard';
import SortDropdown from './shared/SortDropdown';

/**
 * BookmarksPage — `/bookmarks` route.
 *
 * Lists the actor's saved discussions by reusing the discussion search with the
 * backend `bookmarked` filter (src/Filter/BookmarkFilter.php), so pagination,
 * sort and ThreadCard rendering all come for free. Guests get a sign-in prompt
 * instead of a list — the nav item is only shown to logged-in users, but a
 * guest can still reach the URL directly.
 */
export default class BookmarksPage extends Page {
  private feedState!: DiscussionFeedState;
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
    app.setTitle(trans('ramon-avocado.forum.bookmarks.title', 'Saved'));
    app.setTitleCount(0);

    if (app.session.user) {
      const sort = m.route.param('sort') || 'latest';
      this.feedState = new DiscussionFeedState({ sort, filter: { bookmarked: true } } as any);
      this.feedState.refresh();
    }
  }

  view() {
    const homeHref = safeRoute('index');

    return (
      <div className="AvocadoDiscussions AvocadoBookmarks">
        <div className="AvocadoNav-helper">
          <IndexSidebar />
        </div>

        <div className="AvocadoDiscussions-header">
          <h1 className="AvocadoDiscussions-title">
            <i className="fas fa-bookmark AvocadoBookmarks-titleIcon" aria-hidden="true" />
            {trans('ramon-avocado.forum.bookmarks.title', 'Saved')}
          </h1>
          {app.session.user && (
            <div className="AvocadoDiscussions-controls">
              <SortDropdown
                options={DISCUSSION_LIST_SORT}
                currentKey={(this.feedState.getParams() as any).sort || 'latest'}
                onChange={(key: string) => this.feedState.refreshParams({ sort: key } as any, 1)}
              />
              <a className="AvocadoDiscussions-homeLink" href={homeHref} onclick={(e: Event) => navigate(e as MouseEvent, homeHref)}>
                <i className="fas fa-arrow-left" aria-hidden="true" />
                {trans('ramon-avocado.forum.discussions.home', 'Home')}
              </a>
            </div>
          )}
        </div>

        {!app.session.user ? this.renderGuestPrompt() : this.renderList()}
      </div>
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

  private renderList() {
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
