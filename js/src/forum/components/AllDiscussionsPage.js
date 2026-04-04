import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Tooltip from 'flarum/common/components/Tooltip';
import Avatar from 'flarum/common/components/Avatar';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import {
  trans,
  numberOr,
  discussionRoute,
  tagRoute,
  displayName,
  formatTimeLabel,
  postPreview,
  tagPillStyle,
  truncate,
  navigate,
  userRoute,
  renderThreadSkeleton,
  renderLoadMore,
  renderEmpty,
} from '../utils';

const SORT_OPTIONS = [
  { key: 'latest',   label: 'Latest',   sort: '-lastPostedAt' },
  { key: 'top',      label: 'Top',      sort: '-commentCount' },
  { key: 'newest',   label: 'Newest',   sort: '-createdAt'    },
  { key: 'oldest',   label: 'Oldest',   sort: 'createdAt'     },
  { key: 'trending', label: 'Trending', sort: '-lastPostedAt' },
];

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// AllDiscussionsPage Component
// ─────────────────────────────────────────────────────────────────────────────

export default class AllDiscussionsPage extends Page {
  oninit(vnode) {
    super.oninit(vnode);

    this.bodyClass = 'App--index';

    this.discussions = [];
    this.loading = false;
    this.hasMore = false;
    this.sort = m.route.param('sort') || 'latest';
    this.offset = 0;
    this.likingIds = new Set();
    this.sortOpen = false;
    this._wsUpdates = 0;
    this._wsHandler = null;
    this._likeHandler = null;
    this._unlikeHandler = null;
    this._deletedHandler = null;
    this._pinnedHandler = null;
    this._updatedLikeIds = new Set();
    this._pendingDiscs = new Map();
    this._newDiscIds = new Set();
    this._selfActionIds = new Set();

    this.loadDiscussions(true);
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    if (!app.pusher) return;

    this._wsHandler = (data) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then((disc) => {
          if (!disc) return;
          const existingIdx = this.discussions.findIndex((d) => String(d.id?.() || '') === discId);
          if (existingIdx >= 0) {
            // Discussion already in list: count updated in store
            m.redraw();
          } else {
            // New discussion: buffer and show pill
            this._pendingDiscs.set(discId, disc);
            m.redraw();
          }
        })
        .catch(() => { this._wsUpdates++; m.redraw(); });
    };

    const handleLikeEvent = (data) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
      // Don't show the dot for the user who performed the action
      const isSelf = this._selfActionIds.has(discId);
      if (isSelf) this._selfActionIds.delete(discId);
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then(() => {
          if (!isSelf) {
            this._updatedLikeIds.add(discId);
            setTimeout(() => { this._updatedLikeIds.delete(discId); m.redraw(); }, 500);
          }
          m.redraw();
        })
        .catch(() => {});
    };
    this._likeHandler = handleLikeEvent;
    this._unlikeHandler = handleLikeEvent;

    this._deletedHandler = (data) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
      const inList = this.discussions.some((d) => String(d.id?.() || '') === discId);
      const inPending = this._pendingDiscs.has(discId);
      if (!inList && !inPending) return;
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then(() => { m.redraw(); })
        .catch(() => {});
    };

    this._pinnedHandler = (data) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then((disc) => {
          if (!disc) return;
          const existingIdx = this.discussions.findIndex((d) => String(d.id?.() || '') === discId);
          if (existingIdx >= 0) {
            this.discussions.sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
          }
          m.redraw();
        })
        .catch(() => {});
    };

    if (app.pusher && typeof app.pusher.then === 'function') {
      app.pusher.then(({ channels }) => {
        if (channels?.main) {
          channels.main.bind('newPost',          this._wsHandler);
          channels.main.bind('postLiked',        this._likeHandler);
          channels.main.bind('postUnliked',      this._unlikeHandler);
          channels.main.bind('postDeleted',      this._deletedHandler);
          channels.main.bind('discussionPinned', this._pinnedHandler);
        }
      });
    }
  }

  onremove(vnode) {
    super.onremove(vnode);
    if (!app.pusher || typeof app.pusher.then !== 'function') return;
    app.pusher.then(({ channels }) => {
      if (channels?.main) {
        if (this._wsHandler)      channels.main.unbind('newPost',          this._wsHandler);
        if (this._likeHandler)    channels.main.unbind('postLiked',        this._likeHandler);
        if (this._unlikeHandler)  channels.main.unbind('postUnliked',      this._unlikeHandler);
        if (this._deletedHandler) channels.main.unbind('postDeleted',      this._deletedHandler);
        if (this._pinnedHandler)  channels.main.unbind('discussionPinned', this._pinnedHandler);
      }
    });
  }

  getSortParam() {
    return SORT_OPTIONS.find((o) => o.key === this.sort)?.sort || '-lastPostedAt';
  }

  loadDiscussions(reset = false) {
    if (this.loading) return;

    if (reset) {
      this.discussions = [];
      this.offset = 0;
      this.hasMore = false;
    }

    this.loading = true;
    m.redraw();

    app.store
      .find('discussions', {
        sort: this.getSortParam(),
        page: { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,firstPost,lastPostedUser,lastPost,tags',
      })
      .then((results) => {
        const items = Array.isArray(results) ? results : [];
        const combined = reset ? [...items] : [...this.discussions, ...items];
        combined.sort((a, b) => {
          const aSticky = a.isSticky?.() ? 1 : 0;
          const bSticky = b.isSticky?.() ? 1 : 0;
          return bSticky - aSticky;
        });
        this.discussions = combined;
        this.hasMore = !!(results.payload?.links?.next);
        this.offset += items.length;
        this.loading = false;
        m.redraw();
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }



  toggleLike(discussion) {
    const firstPost = discussion.firstPost?.();
    if (!firstPost) return;
    const id = discussion.id?.();
    if (this.likingIds.has(id)) return;
    const likes = firstPost.likes?.() || [];
    const isLiked = app.session.user && likes.some((u) => u === app.session.user);
    this.likingIds.add(id);
    this._selfActionIds.add(id);
    m.redraw();
    firstPost.save({ isLiked: !isLiked })
      .then(() => { this.likingIds.delete(id); m.redraw(); })
      .catch(() => { this.likingIds.delete(id); this._selfActionIds.delete(id); m.redraw(); });
  }

  // ── Render helpers (shared style with HomePage) ───────────────────────────

  renderAvatar(user, className = '') {
    if (!user) return null;
    return <Avatar user={user} className={className || undefined} title={displayName(user)} />;
  }

  renderReplyCard(discussion) {
    const lastPoster = discussion.lastPostedUser?.();
    const lastPost = discussion.lastPost?.();
    const replies = numberOr(discussion.replyCount?.(), 0);
    if (!lastPoster && !lastPost) return null;
    const rawText = lastPost?.contentPlain?.() || '';
    const preview = truncate(rawText, 100);
    const otherCount = replies - 1;
    const href = discussionRoute(discussion);
    const lastPostHref = (() => {
      try {
        const num = discussion.lastPostNumber?.();
        return num ? app.route.discussion(discussion, num) : href;
      } catch (e) { return href; }
    })();
    const secondPostHref = (() => {
      try { return app.route.discussion(discussion, 2); } catch (e) { return href; }
    })();
    return (
      <div className="AvocadoHome-replyCard">
        <a
          className="AvocadoHome-replyCard-line"
          href={lastPostHref}
          onclick={(e) => { e.stopPropagation(); navigate(e, lastPostHref); }}
        >
          <div className="AvocadoHome-replyCard-avatar">{this.renderAvatar(lastPoster)}</div>
          <span className="AvocadoHome-replyCard-name">{displayName(lastPoster)}</span>
          {preview && <span className="AvocadoHome-replyCard-text">{preview}</span>}
        </a>
        {otherCount > 0 && (
          <a
            className="AvocadoHome-replyCard-seeMore"
            href={secondPostHref}
            onclick={(e) => { e.stopPropagation(); navigate(e, secondPostHref); }}
          >
            {otherCount === 1 ? trans('ramon-avocado.forum.home.see_other_reply_singular', 'See other {count} reply', { count: otherCount }) : trans('ramon-avocado.forum.home.see_other_replies', 'See other {count} replies', { count: otherCount })}
          </a>
        )}
      </div>
    );
  }

  renderThreadCard(discussion) {
    if (!discussion) return null;
    const id = discussion.id?.();
    const user = discussion.user?.();
    const title = discussion.title?.() || 'Untitled';
    const href = discussionRoute(discussion);
    const tags = (discussion.tags?.() || []).filter(Boolean);
    const isSticky = discussion.isSticky?.() || false;
    const isFollowing = discussion.subscription?.() === 'follow';
    const isUnread = discussion.isUnread?.() || false;
    const replies = numberOr(discussion.replyCount?.(), 0);
    const likes = numberOr(discussion.firstPost?.()?.attribute?.('likesCount'), 0);
    const isLiked = app.session.user && (discussion.firstPost?.()?.likes?.() || []).some((u) => u === app.session.user);
    const isLiking = this.likingIds.has(id);
    const excerpt = postPreview(discussion);
    const timeLabel = formatTimeLabel(discussion.lastPostedAt?.());
    const userProfileHref = userRoute(user);

    const isNewDisc = this._newDiscIds.has(id);

    return (
      <article key={id} className={`AvocadoHome-threadCard${isUnread ? ' AvocadoHome-threadCard--unread' : ''}${isNewDisc ? ' AvocadoHome-threadCard--new' : ''}`}>
        <div className="AvocadoHome-threadHead">
          <div className="AvocadoHome-avatarWrap">{this.renderAvatar(user)}</div>
          <div className="AvocadoHome-threadMain">
            <div className="AvocadoHome-threadMeta">
              <a
                className="AvocadoHome-threadAuthor"
                href={userProfileHref}
                onclick={(e) => { e.stopPropagation(); navigate(e, userProfileHref); }}
              >{displayName(user)}</a>
              {timeLabel && <span className="AvocadoHome-threadTime">{timeLabel}</span>}
              {isNewDisc && <span className="AvocadoStatDot AvocadoStatDot--new" aria-hidden="true" />}
              {isSticky && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--sticky">
                    <i className="fas fa-thumbtack" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {isFollowing && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_following', 'Following discussions')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--following">
                    <i className="fas fa-star" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {tags.slice(0, 4).map((tag, idx) => {
                const tagColor = tag.color?.() || null;
                const extraClass = idx >= 2 ? ' AvocadoHome-tagPill--extra' : '';
                const tagStyle = tagPillStyle(tagColor);
                return (
                  <a
                    key={tag.id?.()}
                    className={`AvocadoHome-tagPill${extraClass}`}
                    href={tagRoute(tag)}
                    onclick={(e) => { e.stopPropagation(); navigate(e, tagRoute(tag)); }}
                    style={tagStyle}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                  </a>
                );
              })}
              {tags.length > 2 && (
                <span className="AvocadoHome-tagMore">+{tags.length - 2}</span>
              )}
            </div>
            <a
              className="AvocadoHome-threadTitle"
              href={href}
              onclick={(e) => navigate(e, href)}
            >
              {title}
            </a>
            {excerpt && <p className="AvocadoHome-threadExcerpt">{excerpt}</p>}
          </div>
          <button
            className="AvocadoHome-replyBtn"
            onclick={(e) => {
              e.stopPropagation();
              if (!app.session.user) {
                app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default));
                return;
              }
              import('flarum/forum/components/ReplyComposer').then(({ default: ReplyComposer }) => {
                if (app.composer) {
                  app.composer.load(ReplyComposer, { user: app.session.user, discussion });
                  app.composer.show();
                }
                m.route.set(href);
              });
            }}
          >
            <i className="fas fa-reply" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.reply_label', 'Reply')}
          </button>
        </div>
        {replies > 0 && (
          <div className="AvocadoHome-threadReplyGroup">
            {this.renderReplyCard(discussion)}
          </div>
        )}
        <div className="AvocadoHome-threadStats">
          <button
            className={`AvocadoHome-statBtn AvocadoHome-statBtn--likes${isLiked ? ' AvocadoHome-statBtn--liked' : ''}${isLiking ? ' AvocadoHome-statBtn--loading' : ''}${this._updatedLikeIds.has(id) ? ' AvocadoHome-statBtn--pop' : ''}`}
            onclick={(e) => {
              e.stopPropagation();
              if (!app.session.user) {
                app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default));
                return;
              }
              this.toggleLike(discussion);
            }}
            title={trans('ramon-avocado.forum.home.like', 'Like')}
          >
            <i className={isLiked ? 'fas fa-thumbs-up' : 'far fa-thumbs-up'} aria-hidden="true" />
            <span>{likes === 1 ? trans('ramon-avocado.forum.home.like_count_singular', '1 like') : trans('ramon-avocado.forum.home.like_count_plural', '{count} likes', { count: likes })}</span>
          </button>
          <button
            className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
            onclick={(e) => { e.stopPropagation(); m.route.set(href); }}
            title={trans('ramon-avocado.forum.home.replies', 'Replies')}
          >
            <i className="far fa-comment" aria-hidden="true" />
            <span>{replies === 1 ? trans('ramon-avocado.forum.home.reply_count_singular', '1 resposta') : trans('ramon-avocado.forum.home.reply_count_plural', '{count} respostas', { count: replies })}</span>
          </button>
        </div>
      </article>
    );
  }



  view() {
    const homeHref = app.route('index');
    const currentSort = SORT_OPTIONS.find((o) => o.key === this.sort) || SORT_OPTIONS[0];

    return (
      <div className="AvocadoDiscussions">
        <div className="AvocadoNav-helper"><IndexSidebar /></div>

        <div className="AvocadoDiscussions-header">
          <h1 className="AvocadoDiscussions-title">
            {trans('ramon-avocado.forum.discussions.title', 'All discussions')}
          </h1>
          <div className="AvocadoDiscussions-controls">
            {/* Sort dropdown */}
            <div className="AvocadoDiscussions-sortWrap">
              <button
                className={`AvocadoDiscussions-sortTrigger${this.sortOpen ? ' is-open' : ''}`}
                onclick={() => { this.sortOpen = !this.sortOpen; m.redraw(); }}
              >
                {currentSort.label}
                <i className={`fas fa-chevron-${this.sortOpen ? 'up' : 'down'}`} aria-hidden="true" />
              </button>
              {this.sortOpen && (
                <div className="AvocadoDiscussions-sortDropdown">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      className={`AvocadoDiscussions-sortOption${this.sort === option.key ? ' is-active' : ''}`}
                      onclick={() => {
                        this.sort = option.key;
                        this.sortOpen = false;
                        this.loadDiscussions(true);
                      }}
                    >
                      <span className="AvocadoDiscussions-sortOption-check">
                        {this.sort === option.key && <i className="fas fa-check" aria-hidden="true" />}
                      </span>
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Home link */}
            <a
              className="AvocadoDiscussions-homeLink"
              href={homeHref}
              onclick={(e) => navigate(e, homeHref)}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
              {trans('ramon-avocado.forum.discussions.home', 'Home')}
            </a>
          </div>
        </div>

        {(this._pendingDiscs.size > 0 || this._wsUpdates > 0) && (
          <div className="AvocadoWsUpdate">
            <button
              className="AvocadoWsUpdate-btn"
              onclick={() => {
                const pending = Array.from(this._pendingDiscs.values());
                this._pendingDiscs.clear();
                this._wsUpdates = 0;
                pending.forEach((disc) => {
                  const discId = String(disc.id?.() || '');
                  const existingIdx = this.discussions.findIndex((d) => String(d.id?.() || '') === discId);
                  if (existingIdx >= 0) this.discussions.splice(existingIdx, 1);
                  const insertPos = this.discussions.findIndex((d) => !d.isSticky?.());
                  this.discussions.splice(insertPos >= 0 ? insertPos : 0, 0, disc);
                  this._newDiscIds.add(discId);
                });
                m.redraw();
                setTimeout(() => { this._newDiscIds.clear(); m.redraw(); }, 4000);
              }}
            >
              <span className="AvocadoWsUpdate-dot" aria-hidden="true" />
              {(() => {
                const n = this._pendingDiscs.size + this._wsUpdates;
                return n === 1 ? '1 new discussion' : `${n} new discussions`;
              })()}
            </button>
          </div>
        )}

        <div className="AvocadoHome-threadStack">
          {this.discussions.map((d) => this.renderThreadCard(d))}
          {this.loading && renderThreadSkeleton()}
          {!this.loading && this.discussions.length === 0 && renderEmpty(trans('ramon-avocado.forum.discussions.empty', 'No discussions found.'))}
        </div>

        {this.hasMore && !this.loading && renderLoadMore(trans('ramon-avocado.forum.discussions.load_more', 'Load more'), () => this.loadDiscussions(false))}
      </div>
    );
  }
}
