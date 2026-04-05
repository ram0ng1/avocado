import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import TextEditor from 'flarum/common/components/TextEditor';
import Tooltip from 'flarum/common/components/Tooltip';
import Avatar from 'flarum/common/components/Avatar';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import abbreviateNumber from 'flarum/common/utils/abbreviateNumber';
// FIX: import shared utilities — removes all local duplicates
import {
  trans,
  numberOr,
  safeRoute,
  discussionRoute,
  tagRoute,
  iconColors,
  tagPillStyle,
  displayName,
  formatTimeLabel,
  postPreview,
  resolveAssetUrl,
  FALLBACK_COLORS,
  FALLBACK_ICONS,
  truncate,
  navigate,
  userRoute,
  renderThreadSkeleton,
  getFeaturedTagIds,
  categoryCardStyle,
  safeCssUrl,
} from '../utils';



// FIX: all local helpers removed — imported from ../utils above.
// formatThreadCount replaced by Flarum core's abbreviateNumber.

// SVG person silhouette — colours driven by var(--primary-color) via CSS classes
const defaultAvatarSvg = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"
    className="Avatar AvocadoDefaultAvatar" aria-hidden="true">
    <circle cx="64" cy="64" r="64" className="AvocadoDefaultAvatar-bg" />
    <circle cx="64" cy="46" r="18" className="AvocadoDefaultAvatar-fg" />
    <path d="M64 70C42 70 24 82 24 96V128H104V96C104 82 86 70 64 70Z"
      className="AvocadoDefaultAvatar-fg" />
  </svg>
);

// ─── Hex → "r,g,b" string for inline rgba() in showcase cards ────────────────
const _hexToRgb = (hex) => {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '0,0,0';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// HomePage Component
// ─────────────────────────────────────────────────────────────────────────────

export default class HomePage extends Component {
  oninit(vnode) {
    super.oninit(vnode);

    this.searchValue = '';
    this.likingIds = new Set();
    this.composerOpen = false;
    this.composerTitle = '';
    this.composerBody = '';
    this.composerTags = [];
    this.composerSubmitting = false;
    this.composerProxy = {};
    this.onlineUsers = [];
    this.tagPickerOpen = false;
    this.tagBypassReqs = false;
    this.tagFilter = '';

    // FIX: memoization cache — invalidated when store discussion count changes
    this._cachedPopular    = null;
    this._cachedLatest     = null;
    this._cachedStoreSize  = -1;
    this._sectionHasNew    = false;
    this._wsHandler        = null;
    this._likeHandler      = null;
    this._unlikeHandler    = null;
    this._deletedHandler   = null;
    this._pinnedHandler    = null;
    this._updatedLikeIds   = new Set();
    this._selfActionIds    = new Set();

    // Showcase grid state
    this.showcaseItems   = [];
    this.showcaseLoading = false;

    // Preload tags
    if (app.tagList?.load) {
      app.tagList.load(['children', 'parent']).catch(() => {});
    }

    // Load online users
    this.loadOnlineUsers();

    // Load showcase discussions (if tag is configured)
    this.loadShowcaseDiscussions();

    // For logged-in users the discussion store is not pre-populated server-side,
    // so we fetch explicitly. This ensures isSticky is available for the sort.
    this.loadHomeDiscussions();
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this._tagPickerOutside = (e) => {
      if (!this.tagPickerOpen) return;
      if (!e.target.closest?.('.AvocadoHome-tagPicker')) {
        this.tagPickerOpen = false;
        this.tagFilter = '';
        m.redraw();
      }
    };
    document.addEventListener('click', this._tagPickerOutside);

    if (app.pusher) {
      this._wsHandler = (data) => {
        const discId = String(data?.discussionId || '');
        if (!discId) return;
        app.store
          .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
          .then(() => {
            this._cachedPopular = null;
            this._cachedLatest = null;
            this._sectionHasNew = true;
            m.redraw();
            setTimeout(() => {
              this._sectionHasNew = false;
              m.redraw();
            }, 5000);
          })
          .catch(() => { m.redraw(); });
      };

      const handleLikeEvent = (data) => {
        const discId = String(data?.discussionId || '');
        if (!discId) return;
        
        const isSelf = this._selfActionIds.has(discId);
        if (isSelf) this._selfActionIds.delete(discId);
        
        // Force invalidate cache to ensure fresh fetch
        this._cachedPopular = null;
        this._cachedLatest = null;
        
        // Fetch fresh data from server
        app.store
          .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
          .then(() => {

            if (!isSelf) {
              this._updatedLikeIds.add(discId);
              setTimeout(() => { 
                this._updatedLikeIds.delete(discId); 
                m.redraw(); 
              }, 500);
            }
            m.redraw();
          })
          .catch(() => {
            m.redraw();
          });
      };
      this._likeHandler = handleLikeEvent;
      this._unlikeHandler = handleLikeEvent;

      this._deletedHandler = (data) => {
        const discId = String(data?.discussionId || '');
        if (!discId) return;
        app.store
          .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
          .then(() => {
            this._cachedPopular = null;
            this._cachedLatest = null;
            m.redraw();
          })
          .catch(() => {});
      };

      this._pinnedHandler = (data) => {
        const discId = String(data?.discussionId || '');
        if (!discId) return;
        app.store
          .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
          .then(() => {
            this._cachedPopular = null;
            this._cachedLatest = null;
            m.redraw();
          })
          .catch(() => {});
      };

      if (typeof app.pusher?.then === 'function') {
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
  }

  onremove(vnode) {
    super.onremove(vnode);
    document.removeEventListener('click', this._tagPickerOutside);
    if (app.pusher && typeof app.pusher.then === 'function') {
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
  }



  allDiscussions() {
    try {
      const pages = app.discussions?.getPages?.() || app.store.all('discussions');
      const discussions = [];
      if (Array.isArray(pages)) {
        if (pages.length && pages[0] && typeof pages[0] === 'object' && 'items' in pages[0]) {
          pages.forEach((page) => {
            if (page && page.items) discussions.push(...page.items);
          });
        } else {
          discussions.push(...pages);
        }
      }
      return discussions.filter(Boolean);
    } catch (e) {
      return app.store.all('discussions').filter(Boolean);
    }
  }

  discussionScore(d) {
    const replyCount = numberOr(d.replyCount?.(), 0);
    const likeCount = numberOr(d.firstPost?.()?.attribute?.('likesCount'), 0);
    const views = numberOr(d.attribute?.('viewCount'), 0);
    const lastPostedAt = d.lastPostedAt?.();
    const ageMs = lastPostedAt ? Date.now() - new Date(lastPostedAt).getTime() : Infinity;
    const agePenalty = Math.max(0, 1 - ageMs / (7 * 24 * 3600 * 1000));
    return replyCount * 2 + likeCount * 3 + views * 0.1 + agePenalty * 20;
  }

  // FIX: invalidate memoization cache when store discussion count changes
  _invalidateIfStoreChanged() {
    const current = app.store.all('discussions').length;
    if (current !== this._cachedStoreSize) {
      this._cachedPopular   = null;
      this._cachedLatest    = null;
      this._cachedStoreSize = current;
    }
  }

  // Returns the showcase tag ID as a string, or null
  _showcaseTagId() {
    return String(app.forum?.attribute('avocadoShowcaseTag') || '') || null;
  }

  // Returns true if discussion belongs to the showcase tag
  _isShowcaseDiscussion(discussion) {
    const tagId = this._showcaseTagId();
    if (!tagId) return false;
    return (discussion.tags?.() || []).some((t) => String(t?.id?.()) === tagId);
  }

  popularDiscussions(limit = 5) {
    this._invalidateIfStoreChanged();
    // NOTE: do NOT cache empty results — discussions may not yet be loaded from
    // app.discussions.getPages(). An empty [] is truthy and would stick forever.
    if (this._cachedPopular?.length > 0) return this._cachedPopular;
    const result = [...this.allDiscussions()]
      .filter((d) => !this._isShowcaseDiscussion(d))
      .sort((a, b) => {
        const aSticky = a.isSticky?.() ? 1 : 0;
        const bSticky = b.isSticky?.() ? 1 : 0;
        if (bSticky !== aSticky) return bSticky - aSticky;
        return this.discussionScore(b) - this.discussionScore(a);
      })
      .slice(0, limit);
    if (result.length > 0) this._cachedPopular = result;
    return result;
  }

  latestDiscussions() {
    this._invalidateIfStoreChanged();
    if (this._cachedLatest?.length > 0) return this._cachedLatest;
    const result = [...this.allDiscussions()]
      .sort((a, b) => {
        const aDate = a.lastPostedAt?.() ? new Date(a.lastPostedAt()) : new Date(0);
        const bDate = b.lastPostedAt?.() ? new Date(b.lastPostedAt()) : new Date(0);
        return bDate - aDate;
      })
      .slice(0, 10);
    if (result.length > 0) this._cachedLatest = result;
    return result;
  }

  topCategories(limit = 7) {
    try {
      const tags = app.store.all('tags').filter((t) => t && !t.parent?.());
      return tags
        .sort((a, b) => {
          const aPos = a.position?.() ?? 9999;
          const bPos = b.position?.() ?? 9999;
          return aPos - bPos;
        })
        .slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  openDiscussion(discussion) {
    const href = discussionRoute(discussion);
    m.route.set(href);
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

    firstPost.save({ isLiked: !isLiked }).then(() => {
      this.likingIds.delete(id);
      // Always redraw to update the UI immediately.
      // If WebSocket is available, it will sync the server state afterwards.
      // If not, the like state is still persisted on the server and the UI reflects this.
      m.redraw();
    }).catch(() => {
      this.likingIds.delete(id);
      this._selfActionIds.delete(id);
      m.redraw();
    });
  }

  openInlineComposer() {
    if (!app.session.user) {
      app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default));
      return;
    }
    if (this.composerOpen) return;
    this.composerOpen = true;
    this.composerTitle = '';
    this.composerBody = '';
    this.composerTags = [];
    this.tagPickerOpen = false;
    this.tagBypassReqs = false;
    this.tagFilter = '';
    this.composerProxy = {}; // Fresh editor driver target each open
    m.redraw();
    setTimeout(() => {
      const el = document.querySelector('.AvocadoHome-composerTitle');
      if (el) el.focus();
    }, 50);
  }

  isComposerValid() {
    // Check if title and body are filled
    const title = this.composerTitle.trim();
    const body = this.composerBody.trim();
    if (!title || !body) return false;

    // Check tag requirements (same logic as flarum/tags addTagComposer.js)
    if (!this.tagBypassReqs) {
      const minP = parseInt(app.forum.attribute('minPrimaryTags')) || 0;
      const minS = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
      const chosenPrimary = this.composerTags.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
      const chosenSecond  = this.composerTags.filter((t) => t.position?.() === null).length;
      const selectableTags = app.store.all('tags').filter(Boolean);
      if (selectableTags.length && (chosenPrimary < minP || chosenSecond < minS)) {
        return false;
      }
    }

    return true;
  }

  submitInlineComposer() {
    if (this.composerSubmitting) return;
    const title = this.composerTitle.trim();
    const body = this.composerBody.trim();
    if (!title || !body) return;

    // Validate tag requirements (same logic as flarum/tags addTagComposer.js)
    if (!this.tagBypassReqs) {
      const minP = parseInt(app.forum.attribute('minPrimaryTags')) || 0;
      const minS = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
      const chosenPrimary = this.composerTags.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
      const chosenSecond  = this.composerTags.filter((t) => t.position?.() === null).length;
      const selectableTags = app.store.all('tags').filter(Boolean);
      if (selectableTags.length && (chosenPrimary < minP || chosenSecond < minS)) {
        this.tagPickerOpen = true;
        m.redraw();
        return;
      }
    }

    this.composerSubmitting = true;
    m.redraw();

    const data = {
      title,
      content: body,
    };

    if (this.composerTags.length > 0) {
      data.relationships = {
        tags: this.composerTags, // pass model instances; store serializes them
      };
    }

    app.store.createRecord('discussions').save(data).then((discussion) => {
      this.composerOpen = false;
      this.composerSubmitting = false;
      this.composerTitle = '';
      this.composerBody = '';
      this.composerTags = [];
      m.redraw();
      m.route.set(app.route.discussion(discussion));
    }).catch(() => {
      this.composerSubmitting = false;
      m.redraw();
    });
  }

  submitSearch(event) {
    event.preventDefault();
    const q = this.searchValue.trim();
    if (!q) return;
    m.route.set(app.route('index') + '?q=' + encodeURIComponent(q));
  }

  likesCount(discussion) {
    return numberOr(discussion.firstPost?.()?.attribute?.('likesCount'), 0);
  }

  replyCount(discussion) {
    return numberOr(discussion.replyCount?.(), 0);
  }

  renderAvatar(user, className = '') {
    if (!user) return null;
    return <Avatar user={user} className={className || undefined} title={displayName(user)} />;
  }

  renderReplyCard(discussion) {
    const lastPoster = discussion.lastPostedUser?.();
    const lastPost = discussion.lastPost?.();
    const replies = this.replyCount(discussion);
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
          <div className="AvocadoHome-replyCard-avatar">
            {this.renderAvatar(lastPoster)}
          </div>
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
    const title = discussion.title?.() || trans('ramon-avocado.forum.home.untitled', 'Untitled');
    const href = discussionRoute(discussion);
    // Exclude the showcase tag from thread card pills (it's shown in the showcase section)
    const showcaseTagId = this._showcaseTagId();
    const tags = (discussion.tags?.() || []).filter((t) => t && String(t.id?.()) !== showcaseTagId);
    const isSticky = discussion.isSticky?.() || false;
    const isFollowing = discussion.subscription?.() === 'follow';
    const isUnread = discussion.isUnread?.() || false;
    const replies = this.replyCount(discussion);
    const likes = this.likesCount(discussion);
    const isLiked = app.session.user && (discussion.firstPost?.()?.likes?.() || []).some((u) => u === app.session.user);
    const isLiking = this.likingIds.has(id);
    const excerpt = postPreview(discussion);
    const lastPostedAt = discussion.lastPostedAt?.();
    const timeLabel = formatTimeLabel(lastPostedAt);
    const userProfileHref = userRoute(user);

    return (
      <article
        key={id}
        className={`AvocadoHome-threadCard${isUnread ? ' AvocadoHome-threadCard--unread' : ''}`}
      >
        <div className="AvocadoHome-threadHead">
          <div className="AvocadoHome-avatarWrap">
            {this.renderAvatar(user)}
          </div>
          <div className="AvocadoHome-threadMain">
            <div className="AvocadoHome-threadMeta">
              <a
                className="AvocadoHome-threadAuthor"
                href={userProfileHref}
                onclick={(e) => { e.stopPropagation(); navigate(e, userProfileHref); }}
              >{displayName(user)}</a>
              {timeLabel && (
                <span className="AvocadoHome-threadTime">{timeLabel}</span>
              )}
              {isSticky && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--sticky" role="img" aria-label={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')}>
                    <i className="fas fa-thumbtack" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {isFollowing && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_following', 'Following')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--following" role="img" aria-label={trans('ramon-avocado.forum.home.badge_following', 'Following')}>
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
            aria-label={trans('ramon-avocado.forum.home.reply_label', 'Reply')}
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

  // ── Showcase Grid ────────────────────────────────────────────────────────

  loadShowcaseDiscussions() {
    const tagId = app.forum?.attribute('avocadoShowcaseTag');
    if (!tagId) return;

    this.showcaseLoading = true;
    m.redraw();

    // Flarum's discussion filter expects the tag SLUG, not the ID.
    const tag = app.store.getById('tags', String(tagId));
    if (tag) {
      this._fetchShowcaseBySlug(tag.slug?.());
    } else {
      app.store.find('tags').then((tags) => {
        const found = (Array.isArray(tags) ? tags : [])
          .find((t) => String(t.id?.()) === String(tagId));
        if (found) this._fetchShowcaseBySlug(found.slug?.());
        else { this.showcaseLoading = false; m.redraw(); }
      }).catch(() => { this.showcaseLoading = false; m.redraw(); });
    }
  }

  _fetchShowcaseBySlug(slug) {
    if (!slug) { this.showcaseLoading = false; m.redraw(); return; }
    app.store
      .find('discussions', {
        filter: { tag: slug },
        include: 'user,firstPost,lastPostedUser,lastPost,tags',
        sort: '-createdAt',
        'page[limit]': 5,
      })
      .then((results) => {
        this.showcaseItems   = Array.isArray(results) ? results.filter(Boolean) : [];
        this.showcaseLoading = false;
        m.redraw();
      })
      .catch(() => { this.showcaseLoading = false; m.redraw(); });
  }

  // Extract first <img src> from a post's rendered HTML.
  _extractFirstImage(post) {
    if (!post) return null;
    // contentHtml is the server-rendered HTML; content() is raw markdown (no <img>).
    const html = post.data?.attributes?.contentHtml
      || post.attribute?.('contentHtml')
      || (typeof post.contentHtml === 'function' ? post.contentHtml() : null)
      || '';
    if (html && typeof html === 'string') {
      try {
        const div = document.createElement('div');
        div.innerHTML = html;
        const imgs = div.querySelectorAll('img[src]');
        for (const img of imgs) {
          const src = img.getAttribute('src') || '';
          if (!src || /^javascript:/i.test(src)) continue;
          const w = parseInt(img.getAttribute('width') || '999', 10);
          const h = parseInt(img.getAttribute('height') || '999', 10);
          if (w <= 32 && h <= 32) continue;
          return src;
        }
      } catch (e) {}
    }
    // Fallback: markdown image syntax or bare URL
    const raw = post.data?.attributes?.content || post.attribute?.('content') || '';
    if (raw && typeof raw === 'string') {
      const mdMatch = raw.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
      if (mdMatch) return mdMatch[1].trim();
      const urlMatch = raw.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#][^\s]*)?/i);
      if (urlMatch) return urlMatch[0];
    }
    return null;
  }

  renderShowcaseCard(discussion) {
    if (!discussion) return null;
    const id            = discussion.id?.();
    const title         = discussion.title?.() || trans('ramon-avocado.forum.home.untitled', 'Untitled');
    const href          = discussionRoute(discussion);
    const firstPost     = discussion.firstPost?.();
    const isSticky      = discussion.isSticky?.() || false;
    const showcaseTagId = this._showcaseTagId();

    const allTags    = (discussion.tags?.() || []).filter(Boolean);
    const otherTags  = allTags.filter((t) => String(t.id?.()) !== showcaseTagId);
    const primaryTag = allTags.find((t) => String(t.id?.()) === showcaseTagId) || allTags[0] || null;
    const tagColor   = primaryTag?.color?.() || null;

    const imageUrl = this._extractFirstImage(firstPost);
    const excerpt  = postPreview(discussion, 140);

    const noImgBg = tagColor
      ? `linear-gradient(135deg,rgba(${_hexToRgb(tagColor)},0.18),rgba(${_hexToRgb(tagColor)},0.06))`
      : 'linear-gradient(135deg,var(--avocado-surface-1),var(--control-bg))';

    const rawDate  = discussion.createdAt?.();
    const dateStr  = formatTimeLabel(rawDate);
    const dateIso  = rawDate ? new Date(rawDate).toISOString() : '';

    const user = discussion.user?.();

    return (
      // article: position:relative, NO overflow:hidden — badges anchor here & tooltip never clips
      <article key={id} className="AvocadoHome-showcaseCard">

        {/* ── Badge — top-left, absolute above image ───────────────────── */}
        {isSticky && (
          <div className="AvocadoHome-showcaseCard-badges">
            <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="bottom">
              <span className="AvocadoHome-badge AvocadoHome-badge--sticky"
                    role="img" aria-label={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')}>
                <i className="fas fa-thumbtack" aria-hidden="true" />
              </span>
            </Tooltip>
          </div>
        )}

        {/* ── Tag pills — top-right, decorative only (no navigation) ── */}
        {otherTags.length > 0 && (
          <div className="AvocadoHome-showcaseCard-topTags">
            {otherTags.slice(0, 2).map((tag) => {
              const c = tag.color?.() || null;
              return (
                <span key={tag.id?.()}
                      className="AvocadoHome-tagPill"
                      style={c ? { '--tag-bg': '#ffffff', '--tag-color': c } : { '--tag-bg': '#ffffff' }}>
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name?.()}
                </span>
              );
            })}
          </div>
        )}

        <a className="AvocadoHome-showcaseCard-link" href={href} onclick={(e) => navigate(e, href)}>

          {/* ── Cover image ──────────────────────────────────────────── */}
          {imageUrl
            ? <img className="AvocadoHome-showcaseCard-img" src={imageUrl} alt={title} loading="lazy" />
            : <div className="AvocadoHome-showcaseCard-noImg" style={{ background: noImgBg }}>
                {primaryTag?.icon?.() && (
                  <i className={primaryTag.icon()} aria-hidden="true"
                     style={tagColor ? { color: tagColor } : {}} />
                )}
              </div>
          }

          {/* ── Content body ─────────────────────────────────────────── */}
          <div className="AvocadoHome-showcaseCard-body">

            {/* Date */}
            {dateStr && (
              <span className="AvocadoHome-showcaseCard-date">
                <time datetime={dateIso}>{dateStr}</time>
              </span>
            )}

            {/* Title + arrow */}
            <div className="AvocadoHome-showcaseCard-titleRow">
              <span className="AvocadoHome-showcaseCard-title">{title}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                   fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                   className="AvocadoHome-showcaseCard-arrow" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12"
                      className="AvocadoHome-showcaseCard-arrow-line" />
                <polyline points="12 5 19 12 12 19"
                          className="AvocadoHome-showcaseCard-arrow-head" />
              </svg>
            </div>

            {/* Excerpt */}
            {excerpt && (
              <p className="AvocadoHome-showcaseCard-excerpt">{excerpt}</p>
            )}

            {/* Author */}
            {user && (
              <div className="AvocadoHome-showcaseCard-author">
                <Avatar user={user} />
                <span className="AvocadoHome-showcaseCard-authorName">{displayName(user)}</span>
              </div>
            )}

          </div>

        </a>
      </article>
    );
  }

  renderShowcaseSlider() {
    const tagId = app.forum?.attribute('avocadoShowcaseTag');
    if (!tagId) return null;

    const isFollowingPage = app.current.get?.('routeName') === 'following';
    if (isFollowingPage) return null;

    const tag     = app.store.getById('tags', String(tagId));
    const items   = [...this.showcaseItems]
      .sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0))
      .slice(0, 5);
    const tagHref = tag ? tagRoute(tag) : null;

    if (items.length === 0) return null;

    return (
      <section className="AvocadoHome-section AvocadoHome-section--showcase">
        <div className="AvocadoHome-sectionHead">
          <h2>{app.forum?.attribute('avocadoShowcaseHeading') || tag?.name?.() || trans('ramon-avocado.forum.home.showcase_heading', 'Showcase')}</h2>
        </div>
        <div className="AvocadoHome-showcaseGrid">
          {items.map((d) => this.renderShowcaseCard(d))}
        </div>
      </section>
    );
  }

  loadHomeDiscussions() {
    // If the store already has discussions loaded (e.g. server preload for guests),
    // skip the fetch. For logged-in users there is no server preload, so we fetch.
    const existing = app.store.all('discussions');
    if (existing.length > 0) return;
    this._fetchHomeDiscussions();
  }

  _fetchHomeDiscussions() {
    this._cachedPopular = null;
    this._cachedLatest = null;
    app.store
      .find('discussions', {
        include: 'user,lastPostedUser,tags,firstPost',
        'page[limit]': 20,
      })
      .then(() => m.redraw())
      .catch(() => {});
  }

  loadOnlineUsers() {
    // Prefer server-injected data (works for guests too; trust even if empty [])
    const injected = app.forum?.attribute('avocadoOnlineUsers');
    if (Array.isArray(injected)) {
      this.onlineUsers = injected; // plain objects: { id, username, displayName, avatarUrl }
      return;
    }

    // Fallback for logged-in users when PHP attribute is not present
    if (!app.session.user) return;

    app.store
      .find('users', { page: { limit: 50 } })
      .then((users) => {
        this.onlineUsers = (Array.isArray(users) ? users : []).filter((u) => u.isOnline?.());
        m.redraw();
      })
      .catch(() => {
        this.onlineUsers = app.store.all('users').filter((u) => u.isOnline?.());
        m.redraw();
      });
  }

  renderOnlineAvatars() {
    if (!app.forum?.attribute('avocadoShowOnlineUsers')) return null;
    if (!this.onlineUsers.length) return null;
    const MAX_SHOWN = 8;
    const shown = this.onlineUsers.slice(0, MAX_SHOWN);
    const extra = this.onlineUsers.length - shown.length;

    // Determine if items are plain objects (server-injected) or User model instances
    const isPlain = shown[0] && typeof shown[0].username === 'string';

    return (
      <div className="AvocadoHome-onlineAvatars">
        {shown.map((user, i) => {
          const key         = isPlain ? user.id : user.id?.();
          // Prefer the live User model from store (has correct color & avatarUrl)
          const userModel   = isPlain ? (key ? app.store.getById('users', String(key)) : null) : user;
          const username    = userModel?.username?.() || (isPlain ? user.username : '');
          const name        = userModel?.displayName?.() || userModel?.username?.() || (isPlain ? (user.displayName || user.username) : displayName(user));
          const avatarUrl   = userModel?.avatarUrl?.() || (isPlain ? (user.avatarUrl || null) : null);
          const profileHref = safeRoute('user', { username });
          const userColor   = userModel?.color?.() || (isPlain ? (user.color || null) : null);
          const fallbackBg  = userColor || FALLBACK_COLORS[(parseInt(String(key), 10) || i) % FALLBACK_COLORS.length];
          return (
            <a
              key={key}
              className="AvocadoHome-onlineAvatars-item"
              href={profileHref}
              onclick={(e) => { e.stopPropagation(); navigate(e, profileHref); }}
              title={name}
              style={{ zIndex: MAX_SHOWN - i }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt={name} className="Avatar" />
                : (userModel
                    ? Avatar.component({ user: userModel })
                    : (app.forum?.attribute('avocadoCustomDefaultAvatar') !== false
                        ? defaultAvatarSvg
                        : <span className="Avatar" style={{ background: fallbackBg }}>{name.charAt(0).toUpperCase()}</span>
                      )
                  )
              }
            </a>
          );
        })}
        {extra > 0 && (
          <span className="AvocadoHome-onlineAvatars-more" title={`${extra} more online`}>
            +{extra}
          </span>
        )}
      </div>
    );
  }



  renderTagPicker() {
    // Limits from forum settings (mirrors TagDiscussionModal / addTagComposer.js)
    const rawMaxP = parseInt(app.forum.attribute('maxPrimaryTags'));
    const rawMaxS = parseInt(app.forum.attribute('maxSecondaryTags'));
    const maxPrimary = isNaN(rawMaxP) ? Infinity : rawMaxP;
    const maxSecond  = isNaN(rawMaxS) ? Infinity : rawMaxS;
    const minPrimary = parseInt(app.forum.attribute('minPrimaryTags'))  || 0;
    const minSecond  = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
    const canBypass  = !!app.forum.attribute('canBypassTagCounts');

    const selected     = this.composerTags;
    const bypass       = this.tagBypassReqs;
    const primaryCount = selected.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
    const secondCount  = selected.filter((t) => t.position?.() === null).length;

    // Build grouped tag list: root tags first (by position), then their children
    const allTags  = app.store.all('tags').filter(Boolean);
    const rootTags = allTags
      .filter((t) => !t.isChild?.())
      .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));

    const tagItems = [];
    for (const root of rootTags) {
      tagItems.push({ tag: root, isChild: false });
      allTags
        .filter((t) => t.isChild?.() && t.parent?.()?.id?.() === root.id?.())
        .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999))
        .forEach((child) => tagItems.push({ tag: child, isChild: true }));
    }

    // Hide secondary/child tags when secondary tags are not allowed and bypass is off
    const visibleItems = (maxSecond === 0 && !bypass)
      ? tagItems.filter(({ isChild }) => !isChild)
      : tagItems;

    // Filter by search text
    const filterText = (this.tagFilter || '').toLowerCase();
    const filtered = filterText
      ? visibleItems.filter(({ tag }) => tag.name?.().toLowerCase().includes(filterText))
      : visibleItems;

    // Whether a tag can be newly selected (limits check)
    const canSelectTag = (tag) => {
      if (bypass || selected.includes(tag)) return true;
      const isPrimary = tag.position?.() !== null && !tag.isChild?.();
      // Secondary tags require at least one primary to be selected first
      if (!isPrimary && primaryCount === 0) return false;
      if (isPrimary && primaryCount >= maxPrimary) return false;
      if (!isPrimary && secondCount >= maxSecond) return false;
      return true;
    };

    // Instruction text shown in trigger when requirements not yet met
    let instruction = '';
    if (!bypass) {
      if (primaryCount < minPrimary) {
        const n = minPrimary - primaryCount;
        instruction = n === 1 ? 'Choose 1 primary tag' : `Choose ${n} primary tags`;
      } else if (secondCount < minSecond) {
        const n = minSecond - secondCount;
        instruction = n === 1 ? 'Choose 1 secondary tag' : `Choose ${n} secondary tags`;
      }
    }

    const addTag = (tag) => {
      if (selected.includes(tag)) return;
      const next = [...selected];
      // Auto-add parent when selecting a child (requireParentTag logic)
      const parent = tag.parent?.();
      if (parent && parent !== false && !next.includes(parent)) next.push(parent);
      next.push(tag);
      this.composerTags = next;
      this.tagFilter = '';
      m.redraw();
    };

    const removeTag = (tag) => {
      // Also remove children whose parent is being removed
      this.composerTags = this.composerTags.filter(
        (t) => t !== tag && t.parent?.()?.id?.() !== tag.id?.()
      );
      m.redraw();
    };

    return (
      <div className="AvocadoHome-tagPicker">
        {/* Trigger button */}
        <button
          className={`AvocadoHome-tagPickerTrigger${this.tagPickerOpen ? ' is-open' : ''}`}
          type="button"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            this.tagPickerOpen = !this.tagPickerOpen;
            if (!this.tagPickerOpen) this.tagFilter = '';
            m.redraw();
          }}
        >
          <i className="fas fa-tag" aria-hidden="true" />
          {selected.length === 0 && (
            <span className="AvocadoHome-tagPickerPlaceholder">
              {instruction || trans('ramon-avocado.forum.home.choose_tags', 'Choose tags')}
            </span>
          )}
          {selected.map((tag) => {
            const tagColor = tag.color?.() || null;
            return (
              <span
                key={tag.id?.()}
                className="AvocadoHome-tagChip"
                style={tagColor ? { '--tag-color': iconColors(tagColor).color } : {}}
                onclick={(e) => { e.preventDefault(); e.stopPropagation(); removeTag(tag); }}
                title="Remove tag"
              >
                {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                {tag.name?.()}
                <i className="fas fa-times AvocadoHome-tagChipRemoveIcon" aria-hidden="true" />
              </span>
            );
          })}
          <i className={`fas fa-chevron-${this.tagPickerOpen ? 'up' : 'down'} AvocadoHome-tagPickerChevron`} aria-hidden="true" />
        </button>

        {/* Dropdown */}
        {this.tagPickerOpen && (
          <div className="AvocadoHome-tagPickerDropdown">
            {/* Search */}
            <div className="AvocadoHome-tagPickerSearch">
              <i className="fas fa-search" aria-hidden="true" />
              <input
                type="text"
                placeholder={trans('ramon-avocado.forum.home.filter_tags', 'Filter tags')}
                value={this.tagFilter || ''}
                oninput={(e) => { this.tagFilter = e.target.value; m.redraw(); }}
                onclick={(e) => e.stopPropagation()}
                oncreate={(vnode) => { setTimeout(() => vnode.dom.focus(), 0); }}
              />
            </div>
            {/* Tag list */}
            {filtered.length === 0
              ? <span className="AvocadoHome-tagPickerEmpty">{trans('ramon-avocado.forum.home.no_tags_found', 'No tags found')}</span>
              : <ul className="AvocadoHome-tagPickerList">
                  {filtered.map(({ tag, isChild }) => {
                    const tagId     = tag.id?.();
                    const isSelected = selected.includes(tag);
                    const tagColor  = tag.color?.() || FALLBACK_COLORS[0];
                    const selectable = canSelectTag(tag);
                    return (
                      <li
                        key={tagId}
                        className={[
                          'AvocadoHome-tagPickerItem',
                          isChild   && 'is-child',
                          isSelected && 'is-selected',
                          !selectable && !isSelected && 'is-disabled',
                        ].filter(Boolean).join(' ')}
                        onclick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!selectable && !isSelected) return;
                          isSelected ? removeTag(tag) : addTag(tag);
                        }}
                      >
                        <span className="AvocadoHome-tagPickerItem-icon" style={{ background: tagColor }}>
                          {tag.icon?.()
                            ? <i className={tag.icon()} aria-hidden="true" />
                            : <i className="fas fa-tag" aria-hidden="true" />
                          }
                        </span>
                        <span className="AvocadoHome-tagPickerItem-name">{tag.name?.()}</span>
                        {tag.description?.() && (
                          <span className="AvocadoHome-tagPickerItem-desc">{tag.description()}</span>
                        )}
                        {isSelected && <i className="fas fa-check AvocadoHome-tagPickerItem-check" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
            }
            {/* Bypass toggle (admins only) */}
            {canBypass && (
              <label className="AvocadoHome-tagPickerBypass" onclick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={this.tagBypassReqs}
                  onchange={(e) => { this.tagBypassReqs = e.target.checked; m.redraw(); }}
                />
                {' Bypass tag requirements'}
              </label>
            )}
          </div>
        )}
      </div>
    );
  }

  renderNavBar() {
    let itemList;
    try {
      itemList = IndexSidebar.prototype.navItems.call({});
    } catch (_) {
      return null;
    }
    // Remove the generic Tags overview — categories section shows them below
    // Remove Avocado's own nav items — these are shown by the home page itself
    itemList.remove('tags');
    itemList.remove('popularHome');
    itemList.remove('allDiscussions');
    const items = itemList.toArray().filter((item) => {
      if (!item) return false;
      // Drop separators (plain HTML elements like <li class="Dropdown-separator">)
      if (typeof item.tag === 'string') return false;
      // TagLinkButton (from flarum/tags) receives `attrs.model` (the Tag model).
      // It computes href internally via initAttrs, so href is never in attrs.
      if (item.attrs && 'model' in item.attrs) return false;
      // Fallback: drop any href that explicitly matches the tag route pattern /t/slug
      const href = item.attrs?.href || '';
      if (/\/t\//.test(href)) return false;
      // Drop the "More..." link (href=/tags or label text contains "More")
      if (/\/tags$/.test(href)) return false;
      const label = item.children?.[0]?.children?.[0]?.children || '';
      if (typeof label === 'string' && label.toLowerCase().includes('more')) return false;
      return true;
    });
    if (!items.length) return null;
    return (
      <nav className="AvocadoHomeNav" aria-label="Navigation">
        {items}
      </nav>
    );
  }

  view() {
    const user = app.session.user;
    const heroImage = app.forum?.attribute('avocadoHeroImage');
    const heroUrl = heroImage ? resolveAssetUrl(heroImage) : null;
    const heroImagePosition = app.forum?.attribute('avocadoHeroImagePosition') || 'center top';
    // Use Flarum's configured Welcome Banner text (admin: Forum Configuration > Welcome Banner)
    const forumTitle = app.forum?.attribute('welcomeTitle') || app.forum?.attribute('title') || '';
    const forumDesc = app.forum?.attribute('welcomeMessage') || app.forum?.attribute('description') || '';

    const isFollowingPage = app.current.get?.('routeName') === 'following';
    const popular = isFollowingPage
      ? this.allDiscussions().slice(0, 5)
      : this.popularDiscussions(5);

    const featuredIds = getFeaturedTagIds();

    // Featured categories appear first, then the rest in position order
    const categories = this.topCategories(7).sort((a, b) => {
      const aF = featuredIds.has(String(a.id?.()));
      const bF = featuredIds.has(String(b.id?.()));
      if (aF === bF) return 0;
      return aF ? -1 : 1;
    });

    const allTagsCount = app.store.all('tags').filter((t) => t && !t.parent?.()).length;
    const extraCategories = Math.max(0, allTagsCount - categories.length);

    const guestCTA = (
      <div className="AvocadoHome-guestCTA">
        <div className="AvocadoHome-guestCTA-actions">
          <button
            className="AvocadoHome-guestCTA-btn AvocadoHome-guestCTA-btn--login"
            onclick={() => app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default))}
          >
            <i className="fas fa-sign-in-alt" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.log_in', 'Log In')}
          </button>
          <span className="AvocadoHome-guestCTA-or">or</span>
          <button
            className="AvocadoHome-guestCTA-btn AvocadoHome-guestCTA-btn--signup"
            onclick={() => app.modal.show(() => import('flarum/forum/components/SignUpModal').then((m) => m.default))}
          >
            <i className="fas fa-user-plus" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.sign_up', 'Sign Up')}
          </button>
        </div>
      </div>
    );

    return (
      <div className="AvocadoHome">
        <div className="AvocadoHome-wrapper">
          <div className="AvocadoHome-main">

          {/* ── Hero banner (guests only) ─────────────────────────────── */}
          {!user && (
            <div
              className={`AvocadoHome-heroBanner${heroUrl ? ' AvocadoHome-heroBanner--hasImage' : ''}`}
              style={heroUrl ? {
                backgroundImage: safeCssUrl(heroUrl),
                backgroundSize: 'cover',
                backgroundPosition: heroImagePosition,
              } : {}}
            >
              <div className="AvocadoHome-heroBannerOverlay">
                <div className="AvocadoHome-heroBannerContent">
                  <div className="AvocadoHome-heroBannerIcon">
                    <i className="fas fa-comments" aria-hidden="true" />
                  </div>
                  <h1 className="AvocadoHome-heroBannerTitle">{forumTitle}</h1>
                  {forumDesc && <p className="AvocadoHome-heroBannerDesc">{forumDesc}</p>}
                  {app.forum?.attribute('avocadoShowGuestCta') !== false && guestCTA}
                </div>
              </div>
            </div>
          )}

          {/* ── Post input / inline composer ─────────────────────────────── */}
          {user && !this.composerOpen && (
            <div
              className="AvocadoHome-postInput"
              onclick={this.openInlineComposer.bind(this)}
            >
              <div className="AvocadoHome-postInput-inner">
                {this.renderAvatar(user, 'AvocadoHome-postInput-avatar')}
                <span className="AvocadoHome-postInput-placeholder">
                  {trans('ramon-avocado.forum.home.start_discussion', 'Tell everyone what are you working on...')}
                </span>
                <button
                  className="AvocadoHome-postInput-newBtn"
                  type="button"
                  onclick={(e) => { e.stopPropagation(); this.openInlineComposer(); }}
                >
                  <i className="fas fa-plus" aria-hidden="true" />
                  {trans('ramon-avocado.forum.home.new_discussion', 'New discussion')}
                </button>
              </div>
            </div>
          )}

          {/* ── Inline composer ───────────────────────────────────────────── */}
          {this.composerOpen && (
            <div className="AvocadoHome-composer">
              {/* Row 1: avatar + title */}
              <div className="AvocadoHome-composer-header">
                <div className="AvocadoHome-composer-avatar">
                  {this.renderAvatar(user)}
                </div>
                <input
                  className="AvocadoHome-composerTitle"
                  type="text"
                  placeholder={trans('ramon-avocado.forum.home.composer_title_placeholder', 'Discussion title…')}
                  value={this.composerTitle}
                  oninput={(e) => { this.composerTitle = e.target.value; }}
                />
              </div>
              {/* Row 2: tag picker */}
              <div className="AvocadoHome-composer-tags">
                {this.renderTagPicker()}
              </div>
              {/* Textarea + toolbar row + footer buttons (all in one positioning context) */}
              <div className="AvocadoHome-composerBody">
                <TextEditor
                  composer={this.composerProxy}
                  value={this.composerBody}
                  placeholder={trans('ramon-avocado.forum.home.composer_body_placeholder', 'Tell everyone what are you working on...')}
                  onchange={(value) => { this.composerBody = value; m.redraw(); }}
                  onsubmit={() => this.submitInlineComposer()}
                />
                {/* Buttons sit inside composerBody so we can overlay them on the toolbar row */}
                <div className="AvocadoHome-composer-footer">
                  <button
                    className="Button AvocadoHome-composer-cancel"
                    type="button"
                    onclick={() => {
                      this.composerOpen = false;
                      this.composerTitle = '';
                      this.composerBody = '';
                      this.composerTags = [];
                      this.tagPickerOpen = false;
                      this.tagBypassReqs = false;
                      this.tagFilter = '';
                      m.redraw();
                    }}
                  >
                    {trans('ramon-avocado.forum.home.composer_close', 'Close')}
                  </button>
                  <button
                    className={`Button Button--primary AvocadoHome-composer-submit${this.composerSubmitting ? ' is-loading' : ''}${!this.isComposerValid() ? ' is-disabled' : ''}`}
                    type="button"
                    disabled={this.composerSubmitting || !this.isComposerValid()}
                    onclick={this.submitInlineComposer.bind(this)}
                  >
                    {this.composerSubmitting
                      ? trans('ramon-avocado.forum.home.composer_submitting', 'Posting…')
                      : trans('ramon-avocado.forum.home.composer_post', 'Post Discussion')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Categories section ────────────────────────────────────────── */}
          {categories.length > 0 && !isFollowingPage && (
            <section className="AvocadoHome-section AvocadoHome-section--categories">
              <div className="AvocadoHome-sectionHead">
                <h2>{trans('ramon-avocado.forum.home.categories_heading', 'Categories')}</h2>
                {/* AvocadoHomeNav inline — separator dash + MENU label + nav pills */}
                {(() => {
                  const nav = this.renderNavBar();
                  if (!nav) return null;
                  // Clone the nav vnode adding the --inline modifier class
                  const inlineNav = { ...nav, attrs: { ...nav.attrs, className: (nav.attrs?.className || '') + ' AvocadoHomeNav--inline' } };
                  return (
                    <div className="AvocadoHome-sectionHead-nav">
                      {inlineNav}
                    </div>
                  );
                })()}
              </div>
              <div className="AvocadoHome-categories">
                {categories.map((cat, idx) => {
                  const catColor   = cat.color?.() || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
                  const catIcon    = cat.icon?.() || FALLBACK_ICONS[idx % FALLBACK_ICONS.length];
                  const catRoute   = tagRoute(cat);
                  const count      = numberOr(cat.discussionCount?.(), 0);
                  const isFeatured = featuredIds.has(String(cat.id?.()));
                  const fireUrl = isFeatured
                    ? resolveAssetUrl('extensions/ramon-avocado/fire.webp')
                    : null;

                  return (
                    <a
                      key={cat.id?.()}
                      className={`AvocadoHome-categoryCard${isFeatured ? ' AvocadoHome-categoryCard--featured' : ''}`}
                      href={catRoute}
                      onclick={(e) => navigate(e, catRoute)}
                      style={categoryCardStyle(catColor)}
                    >
                      {isFeatured && fireUrl && (
                        <Tooltip text={trans('ramon-avocado.forum.tags.featured', 'Featured')} position="top">
                          <span className="AvocadoHome-featuredBadge">
                            <img src={fireUrl} alt="" aria-hidden="true" />
                          </span>
                        </Tooltip>
                      )}
                      <span className="AvocadoHome-categoryIcon">
                        <i className={catIcon} aria-hidden="true" />
                      </span>
                      <div className="AvocadoHome-categoryBody">
                        <h3>{cat.name?.()}</h3>
                        <p>{abbreviateNumber(numberOr(count, 0))} {trans('ramon-avocado.forum.home.discussions', 'discussions')}</p>
                      </div>
                    </a>
                  );
                })}
                <a
                  className="AvocadoHome-categoryCard AvocadoHome-categoryCard--all"
                  href={safeRoute('tags')}
                  onclick={(e) => navigate(e, safeRoute('tags'))}
                >
                  <div className="AvocadoHome-categoryBody">
                    <h3>{trans('ramon-avocado.forum.home.all_categories', 'All categories')}</h3>
                    <p>{extraCategories} {trans('ramon-avocado.forum.home.more', 'more')}</p>
                  </div>
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </a>
              </div>
            </section>
          )}

          {/* ── Showcase Slider ──────────────────────────────────────────── */}
          {this.renderShowcaseSlider()}

          {/* ── Popular / Following discussions ───────────────────────────── */}
          <section className="AvocadoHome-section">
            <div className="AvocadoHome-sectionHead">
              <h2>{isFollowingPage
                ? trans('ramon-avocado.forum.home.following_heading', 'Following')
                : trans('ramon-avocado.forum.home.popular_heading', 'Popular discussions')
              }</h2>
              <div className="AvocadoHome-sectionHead-right">
                {this._sectionHasNew && <span className="AvocadoStatDot AvocadoHome-sectionDot" aria-hidden="true" />}
                {this.renderOnlineAvatars()}
                <a
                  className="AvocadoHome-seeAll"
                  href={safeRoute('avocado-discussions')}
                  onclick={(e) => navigate(e, safeRoute('avocado-discussions'))}
                >
                  {trans('ramon-avocado.forum.home.see_all', 'See all')}{' '}
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="AvocadoHome-threadStack">
              {popular.length === 0
                ? renderThreadSkeleton()
                : popular.map((d) => this.renderThreadCard(d))
              }
            </div>
          </section>

        </div>

        </div>
      </div>
    );
  }
}
