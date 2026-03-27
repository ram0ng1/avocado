import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import Tooltip from 'flarum/common/components/Tooltip';
import {
  hexToRgba,
  discussionRoute,
  tagRoute,
  displayName,
  formatTimeLabel,
  truncate,
  highlight,
  numberOr,
} from '../utils';

const SORT_LABELS = {
  relevance: 'Relevance',
  latest:    'Latest',
  top:       'Top',
  newest:    'Newest',
  oldest:    'Oldest',
};

// ─────────────────────────────────────────────────────────────────────────────
// AvocadoDiscussionsSearchPage
// Injected into IndexPage.contentItems when ?q= is present.
// Uses app.discussions (DiscussionListState) already populated by IndexPage.
// ─────────────────────────────────────────────────────────────────────────────

export default class AvocadoDiscussionsSearchPage extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.sortOpen  = false;
    this.likingIds = new Set();
  }

  navigate(e, href) {
    e.preventDefault();
    m.route.set(href);
  }

  toggleLike(discussion) {
    const firstPost = discussion.firstPost?.();
    if (!firstPost) return;
    const id = discussion.id?.();
    if (this.likingIds.has(id)) return;
    const likes   = firstPost.likes?.() || [];
    const isLiked = app.session.user && likes.some((u) => u === app.session.user);
    this.likingIds.add(id);
    m.redraw();
    firstPost.save({ isLiked: !isLiked })
      .then(() => { this.likingIds.delete(id); m.redraw(); })
      .catch(() => { this.likingIds.delete(id); m.redraw(); });
  }

  getRawExcerpt(discussion) {
    try {
      const mrp = discussion.mostRelevantPost?.();
      if (mrp) {
        const plain = mrp.contentPlain?.() || '';
        if (plain) return plain;
      }
      return discussion.firstPost?.()?.contentPlain?.() || '';
    } catch (_) {
      return '';
    }
  }

  renderSkeleton() {
    return [0, 1, 2].map((i) => (
      <div key={String(i)} className="AvocadoHome-skeletonCard">
        <div className="AvocadoHome-skeletonAvatar" />
        <div className="AvocadoHome-skeletonBody">
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--lg" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md" />
        </div>
      </div>
    ));
  }

  renderThreadCard(discussion) {
    const id       = discussion.id?.();
    const user     = discussion.user?.();
    const title    = discussion.title?.() || 'Untitled';
    const href     = discussionRoute(discussion);
    const tags     = (discussion.tags?.() || []).filter(Boolean);
    const isSticky = discussion.isSticky?.() || false;
    const isFollowing = discussion.subscription?.() === 'follow';
    const isUnread = discussion.isUnread?.() || false;
    const replies  = numberOr(discussion.replyCount?.(), 0);
    const q        = m.route.param('q') || '';
    const rawExcerpt = this.getRawExcerpt(discussion);
    const timeLabel = formatTimeLabel(discussion.lastPostedAt?.());
    const userProfileHref = (() => {
      if (!user) return '#';
      try { return app.route('user', { username: user.username?.() || '' }); } catch (_) { return '#'; }
    })();

    return (
      <article key={id} className={`AvocadoSearch-threadCard${isUnread ? ' AvocadoSearch-threadCard--unread' : ''}`}>
        <div className="AvocadoSearch-threadHead">
          <div className="AvocadoSearch-threadAvatar">
            {user && <Avatar user={user} title={displayName(user)} />}
          </div>
          <div className="AvocadoSearch-threadMain">
            <div className="AvocadoSearch-threadMeta">
              <a
                className="AvocadoSearch-threadAuthor"
                href={userProfileHref}
                onclick={(e) => { e.stopPropagation(); this.navigate(e, userProfileHref); }}
              >
                {displayName(user)}
              </a>
              {timeLabel && <span className="AvocadoSearch-threadTime">{timeLabel}</span>}
              {isSticky && (
                <Tooltip text="Pinned" position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--sticky" aria-label="Pinned">
                    <i className="fas fa-thumbtack" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {isFollowing && (
                <Tooltip text="Following" position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--following" aria-label="Following">
                    <i className="fas fa-star" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {tags.slice(0, 4).map((tag, idx) => {
                const tagColor   = tag.color?.() || null;
                const extraClass = idx >= 2 ? ' AvocadoHome-tagPill--extra' : '';
                const tagStyle   = tagColor ? { '--tag-bg': hexToRgba(tagColor, 0.1), '--tag-color': tagColor } : {};
                return (
                  <a
                    key={tag.id?.()}
                    className={`AvocadoHome-tagPill${extraClass}`}
                    href={tagRoute(tag)}
                    onclick={(e) => { e.stopPropagation(); this.navigate(e, tagRoute(tag)); }}
                    style={tagStyle}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                  </a>
                );
              })}
            </div>
            <a
              className="AvocadoSearch-threadTitle"
              href={href}
              onclick={(e) => this.navigate(e, href)}
            >
              {q ? highlight(title, q) : title}
            </a>
            {rawExcerpt && (
              <p className="AvocadoSearch-threadExcerpt">
                {q ? highlight(rawExcerpt, q, 160) : truncate(rawExcerpt, 160)}
              </p>
            )}
            <div className="AvocadoSearch-threadFooter">
              <span className="AvocadoSearch-threadReplies">
                <i className="far fa-comment" aria-hidden="true" />
                {replies === 1 ? '1 reply' : `${replies} replies`}
              </span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  renderSortDropdown() {
    const sortMap     = app.discussions.sortMap();
    const currentSort = app.search.state.params().sort || Object.keys(sortMap)[0];

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
    const q      = m.route.param('q') || '';
    const filter = m.route.param('filter') || {};
    if (q) {
      return (
        <>Results for <span className="AvocadoSearch-query">"{q}"</span></>
      );
    }
    // Gambit-only search — reconstruct a readable label from active filter keys
    const parts = Object.entries(filter)
      .filter(([k]) => !k.startsWith('-'))
      .map(([k, v]) => `${k}:${v}`);
    if (parts.length > 0) {
      return (
        <>Filtered by <span className="AvocadoSearch-query">{parts.join(', ')}</span></>
      );
    }
    return 'Search results';
  }

  view() {
    const state     = app.discussions;
    const isLoading = state.isInitialLoading() || state.isLoadingNext();
    const items     = state.getPages().flatMap((pg) => pg.items);
    const q         = m.route.param('q') || '';
    const filter    = m.route.param('filter') || {};

    return (
      <div className="AvocadoSearch AvocadoSearch--discussions">
        <div className="AvocadoSearch-header">
          <h1 className="AvocadoSearch-title">{this.renderTitle()}</h1>
          {this.renderSortDropdown()}
        </div>

        {isLoading && items.length === 0 ? (
          <div className="AvocadoSearch-stack">{this.renderSkeleton()}</div>
        ) : items.length === 0 ? (
          <div className="AvocadoSearch-empty">
            <i className="far fa-frown-open" aria-hidden="true" />
            <p>{q ? `No discussions found for "${q}".` : 'No discussions match these filters.'}</p>
          </div>
        ) : (
          <div className="AvocadoSearch-stack">
            {items.map((d) => this.renderThreadCard(d))}
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
