import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import PostListState from 'flarum/forum/states/PostListState';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import extractText from 'flarum/common/utils/extractText';
import {
  displayName,
  formatTimeLabel,
  truncate,
  highlight,
} from '../utils';

const SORT_LABELS = {
  relevance: 'Relevance',
  newest:    'Newest',
  oldest:    'Oldest',
};

// ─────────────────────────────────────────────────────────────────────────────
// AvocadoPostsSearchPage
// Replaces the standard PostsPage route (/posts?q=).
// Manages its own PostListState; mirrors PostsPage.oninit logic.
// ─────────────────────────────────────────────────────────────────────────────

export default class AvocadoPostsSearchPage extends Page {
  static providesInitialSearch = true;

  oninit(vnode) {
    super.oninit(vnode);

    this.postsState = new PostListState({});
    this.postsState.refreshParams(
      app.search.state.params(),
      (m.route.param('page') && Number(m.route.param('page'))) || 1,
    );

    app.history.push('posts', extractText(app.translator.trans('core.forum.header.back_to_index_tooltip')));

    this.bodyClass = 'App--posts App--avocadoSearch';
    this.scrollTopOnCreate = false;
    this.sortOpen = false;
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    app.setTitle(extractText(app.translator.trans('core.forum.posts.meta_title_text')));
    app.setTitleCount(0);
  }

  navigate(e, href) {
    e.preventDefault();
    m.route.set(href);
  }

  renderSkeleton() {
    return [0, 1, 2].map((i) => (
      <div key={String(i)} className="AvocadoSearch-postSkeleton">
        <div className="AvocadoHome-skeletonAvatar" />
        <div className="AvocadoHome-skeletonBody">
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--lg" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm" style="width:28%" />
        </div>
      </div>
    ));
  }

  renderPostCard(post) {
    const q          = app.search.state.params().q || '';
    const discussion = post.discussion?.();
    const user       = post.user?.();
    const content    = post.contentPlain?.() || '';
    const href       = app.route.post(post);
    const userHref   = user
      ? (() => { try { return app.route('user', { username: user.username?.() || '' }); } catch (_) { return '#'; } })()
      : '#';
    const timeLabel  = formatTimeLabel(post.createdAt?.());

    // highlight() truncates around the first match — ideal for post excerpts.
    const excerptNode = content
      ? (q ? highlight(content, q, 220) : truncate(content, 220))
      : null;
    const discussionTitle = discussion?.title?.() || '';
    const discussionNode  = q ? highlight(discussionTitle, q) : discussionTitle;

    return (
      <article key={post.id()} className="AvocadoSearch-postCard">
        <div className="AvocadoSearch-postHead">
          <div className="AvocadoSearch-postAvatar">
            {user && <Avatar user={user} />}
          </div>
          <div className="AvocadoSearch-postMeta">
            <a
              href={userHref}
              className="AvocadoSearch-postAuthor"
              onclick={(e) => { e.stopPropagation(); this.navigate(e, userHref); }}
            >
              {displayName(user)}
            </a>
            {timeLabel && <span className="AvocadoSearch-postTime">{timeLabel}</span>}
          </div>
        </div>
        {discussion && (
          <a
            href={href}
            className="AvocadoSearch-postDiscussion"
            onclick={(e) => this.navigate(e, href)}
          >
            <i className="far fa-comments" aria-hidden="true" />
            {discussionNode}
          </a>
        )}
        {excerptNode && <p className="AvocadoSearch-postExcerpt">{excerptNode}</p>}
        <div className="AvocadoSearch-postFooter">
          <a
            href={href}
            className="AvocadoSearch-postViewBtn"
            onclick={(e) => this.navigate(e, href)}
          >
            View post
            <i className="fas fa-arrow-right" aria-hidden="true" />
          </a>
        </div>
      </article>
    );
  }

  renderSortDropdown() {
    const sortMap     = this.postsState.sortMap();
    const currentSort = app.search.state.params().sort || Object.keys(sortMap)[0];

    if (Object.keys(sortMap).length <= 1) return null;

    return (
      <div className="AvocadoDiscussions-sortWrap">
        <button
          className={`AvocadoDiscussions-sortTrigger${this.sortOpen ? ' is-open' : ''}`}
          onclick={() => { this.sortOpen = !this.sortOpen; m.redraw(); }}
        >
          {SORT_LABELS[currentSort] || currentSort}
          <i className={`fas fa-chevron-${this.sortOpen ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
        {this.sortOpen && (
          <div className="AvocadoDiscussions-sortDropdown">
            {Object.keys(sortMap).map((key) => (
              <button
                key={key}
                className={`AvocadoDiscussions-sortOption${currentSort === key ? ' is-active' : ''}`}
                onclick={() => {
                  this.sortOpen = false;
                  app.search.state.changeSort(key);
                  m.redraw();
                }}
              >
                <span className="AvocadoDiscussions-sortOption-check">
                  {currentSort === key && <i className="fas fa-check" aria-hidden="true" />}
                </span>
                {SORT_LABELS[key] || key}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  renderTitle() {
    const params = app.search.state.params();
    const q      = params.q || '';
    const filter = params.filter || {};
    if (q) {
      return (
        <>Posts for <span className="AvocadoSearch-query">"{q}"</span></>
      );
    }
    const parts = Object.entries(filter)
      .filter(([k]) => !k.startsWith('-'))
      .map(([k, v]) => `${k}:${v}`);
    if (parts.length > 0) {
      return (
        <>Posts filtered by <span className="AvocadoSearch-query">{parts.join(', ')}</span></>
      );
    }
    return 'Posts search';
  }

  view() {
    const params    = app.search.state.params();
    const q         = params.q || '';
    const state     = this.postsState;
    const isLoading = state.isInitialLoading() || state.isLoadingNext();
    const allPosts  = state.getPages().flatMap((pg) => pg.items);

    return (
      <div className="AvocadoSearch AvocadoSearch--posts">
        <div className="AvocadoNav-helper"><IndexSidebar /></div>

        <div className="AvocadoSearch-header">
          <h1 className="AvocadoSearch-title">{this.renderTitle()}</h1>
          {this.renderSortDropdown()}
        </div>

        {isLoading && allPosts.length === 0 ? (
          <div className="AvocadoSearch-postStack">{this.renderSkeleton()}</div>
        ) : allPosts.length === 0 ? (
          <div className="AvocadoSearch-empty">
            <i className="far fa-frown-open" aria-hidden="true" />
            <p>{q ? `No posts found for "${q}".` : 'No posts match these filters.'}</p>
          </div>
        ) : (
          <div className="AvocadoSearch-postStack">
            {allPosts.map((post) => this.renderPostCard(post))}
            {isLoading && this.renderSkeleton()}
            {!isLoading && state.hasNext() && (
              <div className="AvocadoDiscussions-loadMore">
                <button
                  className="AvocadoDiscussions-loadMoreBtn"
                  onclick={() => state.loadNext()}
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
