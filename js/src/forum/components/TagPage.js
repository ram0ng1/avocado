import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Tooltip from 'flarum/common/components/Tooltip';
import Avatar from 'flarum/common/components/Avatar';
import {
  trans,
  numberOr,
  tagRoute,
  displayName,
  formatTimeLabel,
  postPreview,
  hexToRgba,
} from '../utils';

const SORT_OPTIONS = [
  { key: 'latest',  label: 'Latest',  sort: '-lastPostedAt' },
  { key: 'top',     label: 'Top',     sort: '-commentCount' },
  { key: 'newest',  label: 'Newest',  sort: '-createdAt'    },
  { key: 'oldest',  label: 'Oldest',  sort: 'createdAt'     },
];

const PAGE_SIZE = 20;

const findTagBySlug = (slug) =>
  app.store.all('tags').find(
    (t) => t.slug?.().localeCompare(slug, undefined, { sensitivity: 'base' }) === 0
  ) || null;

// ─────────────────────────────────────────────────────────────────────────────
// AvocadoTagPage — standalone Page component, registered on app.routes['tag']
// ─────────────────────────────────────────────────────────────────────────────

export default class AvocadoTagPage extends Page {

  oninit(vnode) {
    super.oninit(vnode);

    this.tag          = null;
    this.tagLoading   = false;
    this.discussions  = [];
    this.loading      = false;
    this.hasMore      = false;
    this.sort         = 'latest';
    this.offset       = 0;
    this.likingIds    = new Set();
    this.sortOpen     = false;
    this._wsUpdates      = 0;
    this._wsHandler      = null;
    this._likeHandler    = null;
    this._unlikeHandler  = null;
    this._deletedHandler = null;
    this._pinnedHandler  = null;
    this._updatedLikeIds = new Set();
    this._pendingDiscs   = new Map();
    this._newDiscIds     = new Set();
    this._selfActionIds  = new Set();

    this.bodyClass = 'App--index';

    const slug = m.route.param('tags');
    this.loadTag(slug);
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    if (!app.pusher) return;

    const tagMatches = (data) => {
      if (!this.tag || !data?.tagIds) return true;
      const ids = Array.isArray(data.tagIds) ? data.tagIds : Object.values(data.tagIds);
      return ids.map(String).includes(String(this.tag.id?.() || ''));
    };

    this._wsHandler = (data) => {
      const discId = String(data?.discussionId || '');
      if (!discId || !tagMatches(data)) return;
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then((disc) => {
          if (!disc) return;
          const existingIdx = this.discussions.findIndex((d) => String(d.id?.() || '') === discId);
          if (existingIdx >= 0) {
            m.redraw();
          } else {
            this._pendingDiscs.set(discId, disc);
            m.redraw();
          }
        })
        .catch(() => { this._wsUpdates++; m.redraw(); });
    };

    const handleLikeEvent = (data) => {
      const discId = String(data?.discussionId || '');
      if (!discId || !tagMatches(data)) return;
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
      if (!discId || !tagMatches(data)) return;
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
      if (!discId || !tagMatches(data)) return;
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

  // ── Tag loading ────────────────────────────────────────────────────────────

  loadTag(slug) {
    if (!slug) return;

    const cached = findTagBySlug(slug);
    if (cached) {
      this.tag = cached;
      this.loadDiscussions(true);
      return;
    }

    this.tagLoading = true;
    app.store
      .find('tags', slug, { include: 'children,children.parent,parent' })
      .then(() => {
        this.tag = findTagBySlug(slug);
        this.tagLoading = false;
        if (this.tag) this.loadDiscussions(true);
        m.redraw();
      })
      .catch(() => {
        this.tagLoading = false;
        m.redraw();
      });
  }

  // ── Discussion loading ─────────────────────────────────────────────────────

  getSortParam() {
    return SORT_OPTIONS.find((o) => o.key === this.sort)?.sort || '-lastPostedAt';
  }

  loadDiscussions(reset = false) {
    if (this.loading || !this.tag) return;

    if (reset) {
      this.discussions = [];
      this.offset      = 0;
      this.hasMore     = false;
    }

    this.loading = true;

    app.store
      .find('discussions', {
        sort:    this.getSortParam(),
        page:    { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,firstPost,lastPostedUser,lastPost,tags',
        filter:  { tag: this.tag.slug() },
      })
      .then((results) => {
        const items    = Array.isArray(results) ? results : [];
        const combined = reset ? [...items] : [...this.discussions, ...items];
        combined.sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
        this.discussions = combined;
        this.hasMore     = !!(results.payload?.links?.next);
        this.offset     += items.length;
        this.loading     = false;
        m.redraw();
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }

  navigate(event, href) {
    event.preventDefault();
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
    this._selfActionIds.add(id);
    m.redraw();
    firstPost.save({ isLiked: !isLiked })
      .then(() => { this.likingIds.delete(id); m.redraw(); })
      .catch(() => { this.likingIds.delete(id); this._selfActionIds.delete(id); m.redraw(); });
  }

  // ── Thread card (same design as AllDiscussionsPage) ────────────────────────

  renderAvatar(user) {
    if (!user) return null;
    return <Avatar user={user} title={displayName(user)} />;
  }

  renderReplyCard(discussion) {
    const lastPoster = discussion.lastPostedUser?.();
    const lastPost   = discussion.lastPost?.();
    const replies    = numberOr(discussion.replyCount?.(), 0);
    if (!lastPoster && !lastPost) return null;
    const rawText  = lastPost?.contentPlain?.() || '';
    const preview  = rawText ? rawText.slice(0, 100) + (rawText.length > 100 ? '…' : '') : '';
    const otherCount = replies - 1;
    const href       = this.discussionHref(discussion);
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
          onclick={(e) => { e.stopPropagation(); this.navigate(e, lastPostHref); }}
        >
          <div className="AvocadoHome-replyCard-avatar">{this.renderAvatar(lastPoster)}</div>
          <span className="AvocadoHome-replyCard-name">{displayName(lastPoster)}</span>
          {preview && <span className="AvocadoHome-replyCard-text">{preview}</span>}
        </a>
        {otherCount > 0 && (
          <a
            className="AvocadoHome-replyCard-seeMore"
            href={secondPostHref}
            onclick={(e) => { e.stopPropagation(); this.navigate(e, secondPostHref); }}
          >
            {otherCount === 1 ? trans('ramon-avocado.forum.home.see_other_reply_singular', 'See other {count} reply', { count: otherCount }) : trans('ramon-avocado.forum.home.see_other_replies', 'See other {count} replies', { count: otherCount })}
          </a>
        )}
      </div>
    );
  }

  discussionHref(discussion) {
    try { return app.route.discussion(discussion); } catch (e) { return '#'; }
  }

  renderThreadCard(discussion) {
    if (!discussion) return null;
    const id        = discussion.id?.();
    const user      = discussion.user?.();
    const title     = discussion.title?.() || 'Untitled';
    const href      = this.discussionHref(discussion);
    const tags      = (discussion.tags?.() || []).filter(Boolean);
    const isSticky  = discussion.isSticky?.() || false;
    const isFollowing = discussion.subscription?.() === 'follow';
    const isUnread  = discussion.isUnread?.() || false;
    const replies   = numberOr(discussion.replyCount?.(), 0);
    const likes     = numberOr(discussion.firstPost?.()?.attribute?.('likesCount'), 0);
    const isLiked   = app.session.user && (discussion.firstPost?.()?.likes?.() || []).some((u) => u === app.session.user);
    const isLiking  = this.likingIds.has(id);
    const excerpt   = postPreview(discussion);
    const timeLabel = formatTimeLabel(discussion.lastPostedAt?.());
    const userProfileHref = (() => {
      if (!user) return '#';
      try { return app.route('user', { username: user.username?.() || '' }); } catch (e) { return '#'; }
    })();

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
                onclick={(e) => { e.stopPropagation(); this.navigate(e, userProfileHref); }}
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
                const isCurrentTag = this.tag && tag.id?.() === this.tag.id?.();
                const extraClass = idx >= 2 ? ' AvocadoHome-tagPill--extra' : '';
                const tagStyle = tagColor ? { '--tag-bg': hexToRgba(tagColor, 0.1), '--tag-color': tagColor } : {};
                if (isCurrentTag) {
                  return (
                    <span
                      key={tag.id?.()}
                      className={`AvocadoHome-tagPill${extraClass}`}
                      style={{ ...tagStyle, cursor: 'default' }}
                    >
                      {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                      {tag.name?.()}
                    </span>
                  );
                }
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
              {tags.length > 2 && (
                <span className="AvocadoHome-tagMore">+{tags.length - 2}</span>
              )}
            </div>
            <a
              className="AvocadoHome-threadTitle"
              href={href}
              onclick={(e) => this.navigate(e, href)}
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
              app.composer
                .load(() => import('flarum/forum/components/ReplyComposer'), { user: app.session.user, discussion })
                .then(() => { app.composer.show(); m.route.set(href); });
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
          >
            <i className={isLiked ? 'fas fa-thumbs-up' : 'far fa-thumbs-up'} aria-hidden="true" />
            <span>{likes === 1 ? trans('ramon-avocado.forum.home.like_count_singular', '1 like') : trans('ramon-avocado.forum.home.like_count_plural', '{count} likes', { count: likes })}</span>
          </button>
          <button
            className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
            onclick={(e) => { e.stopPropagation(); m.route.set(href); }}
          >
            <i className="far fa-comment" aria-hidden="true" />
            <span>{replies === 1 ? trans('ramon-avocado.forum.home.reply_count_singular', '1 resposta') : trans('ramon-avocado.forum.home.reply_count_plural', '{count} respostas', { count: replies })}</span>
          </button>
        </div>
      </article>
    );
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

  // ── View ──────────────────────────────────────────────────────────────────

  view() {
    // Tag still loading
    if (this.tagLoading) {
      return (
        <div className="AvocadoTagPage">
          <div className="AvocadoTagPage-hero" style={{ '--tag-color': '#8f8f99' }}>
            <div className="AvocadoTagPage-hero-inner">
              <div className="AvocadoTagPage-hero-body">
                <div style={{ flex: 1 }}>
                  <div className="AvocadoTagsPage-shimmer AvocadoTagsPage-shimmer--name" style={{ width: '200px', height: '30px' }} />
                </div>
              </div>
            </div>
          </div>
          <div className="AvocadoTagPage-body">{this.renderSkeleton()}</div>
        </div>
      );
    }

    // Tag not found
    if (!this.tag) {
      return (
        <div className="AvocadoTagPage">
          <div className="AvocadoTagPage-body">
            <div className="AvocadoDiscussions-empty">Tag not found.</div>
          </div>
        </div>
      );
    }

    const tag     = this.tag;
    const color   = tag.color?.()       || '#3f88f6';
    const tagName = tag.name?.()        || '';
    const tagDesc = tag.description?.() || '';
    const tagIcon = tag.icon?.()        || null;
    const count   = tag.discussionCount?.() || 0;
    const children = (tag.children?.() || []).filter(Boolean);

    const currentSort = SORT_OPTIONS.find((o) => o.key === this.sort) || SORT_OPTIONS[0];
    const discHref    = (() => { try { return app.route('avocado-discussions'); } catch (e) { return '/discussions'; } })();

    return (
      <div className="AvocadoTagPage">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <header className="AvocadoTagPage-hero" style={{ '--tag-color': color }}>
          <div className="AvocadoTagPage-hero-inner">

            {/* Single row: back + icon + name/count + subtags + new-discussion button */}
            <div className="AvocadoTagPage-hero-row">
              <button
                className="AvocadoTagPage-back"
                aria-label="Back"
                onclick={() => {
                  if (window.history.length > 1) window.history.back();
                  else m.route.set(app.route('index'));
                }}
              >
                <i className="fas fa-arrow-left" aria-hidden="true" />
              </button>

              {tagIcon && (
                <span className="AvocadoTagPage-hero-icon">
                  <i className={tagIcon} aria-hidden="true" />
                </span>
              )}

              <div className="AvocadoTagPage-hero-text">
                <h1 className="AvocadoTagPage-hero-name">{tagName}</h1>
                <span className="AvocadoTagPage-hero-count">
                  {count} {count === 1 ? 'discussion' : 'discussions'}
                </span>
              </div>

              {children.length > 0 && (
                <div className="AvocadoTagPage-hero-subtags">
                  {children.slice(0, 6).map((child) => {
                    const childHref = tagRoute(child);
                    return (
                      <a
                        key={child.id?.()}
                        className="AvocadoTagPage-subtag"
                        href={childHref}
                        onclick={(e) => this.navigate(e, childHref)}
                      >
                        {child.name?.()}
                      </a>
                    );
                  })}
                </div>
              )}

              <button
                className="AvocadoTagPage-newBtn"
                onclick={() => {
                  if (!app.session.user) {
                    app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default));
                    return;
                  }
                  const parent = tag.parent?.();
                  const selectedTags = parent ? [parent, tag] : [tag];
                  app.composer
                    .load(() => import('flarum/forum/components/DiscussionComposer'), { user: app.session.user })
                    .then(() => {
                      app.composer.fields.tags = selectedTags;
                      app.composer.show();
                      m.redraw();
                    });
                }}
              >
                <i className="fas fa-plus" aria-hidden="true" />
                {trans('ramon-avocado.forum.home.new_discussion', 'New discussion')}
              </button>
            </div>

          {/* Tag description */}
          {tagDesc && (
            <p className="AvocadoTagPage-hero-desc">{tagDesc}</p>
          )}

          </div>

        </header>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="AvocadoTagPage-body">

          {/* Controls row: sort dropdown + all-discussions link */}
          <div className="AvocadoTagPage-controls">
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
            <a
              className="AvocadoTagPage-allDiscLink"
              href={discHref}
              onclick={(e) => this.navigate(e, discHref)}
            >
              {trans('ramon-avocado.forum.home.all_title', 'All Discussions')}
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </a>
          </div>

          {/* Thread list */}
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
            {this.loading && this.renderSkeleton()}
            {!this.loading && this.discussions.length === 0 && (
              <div className="AvocadoDiscussions-empty">
                No discussions in this category yet.
              </div>
            )}
          </div>

          {/* Load more */}
          {this.hasMore && !this.loading && (
            <div className="AvocadoDiscussions-loadMore">
              <button
                className="AvocadoDiscussions-loadMoreBtn"
                onclick={() => this.loadDiscussions(false)}
              >
                Load more
              </button>
            </div>
          )}

        </div>
      </div>
    );
  }
}
