import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import TextEditor from 'flarum/common/components/TextEditor';
import Tooltip from 'flarum/common/components/Tooltip';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const trans = (key, fallback, params = {}) => {
  const out = app.translator?.trans(key, params);
  return out && out !== key ? out : fallback;
};

const numberOr = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const safeRoute = (name, params = {}, fallback = '#') => {
  try {
    return app.route(name, params);
  } catch (e) {
    return fallback;
  }
};

const discussionRoute = (discussion, near) => {
  try {
    return app.route.discussion(discussion, near);
  } catch (e) {
    return '#';
  }
};

const tagRoute = (tag) => {
  try {
    return app.route('tag', { tags: tag.slug() });
  } catch (e) {
    return '#';
  }
};

const avatarInitial = (user, fallback = '?') => {
  const name = user?.username?.() || user?.displayName?.() || '';
  return name ? name.charAt(0).toUpperCase() : fallback;
};

const displayName = (user) => {
  return user?.displayName?.() || user?.username?.() || '';
};

const formatThreadCount = (count) => {
  const n = numberOr(count, 0);
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
};

const formatTimeLabel = (dateValue) => {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);

  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (date >= startOfToday) {
    return `Today, ${timeStr}`;
  }
  if (date >= startOfYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  const monthStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${monthStr}, ${timeStr}`;
};

const postPreview = (discussion) => {
  try {
    const firstPost = discussion.firstPost?.();
    if (firstPost) {
      const plain = firstPost.contentPlain?.() || '';
      if (plain) return plain.slice(0, 180);
    }
    // Fallback: try content attribute
    const content = discussion.attribute?.('firstPostContent') || '';
    return content.slice(0, 180);
  } catch (e) {
    return '';
  }
};

const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(63,136,246,${alpha})`;
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(63,136,246,${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const resolveAssetUrl = (assetPath) => {
  if (!assetPath) return null;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const assetsBaseUrl = app.forum?.attribute('assetsBaseUrl');
  if (assetsBaseUrl) {
    return assetsBaseUrl.replace(/\/+$/, '') + '/' + String(assetPath).replace(/^\/+/, '');
  }
  const forumBaseUrl = app.forum?.attribute('baseUrl');
  if (forumBaseUrl) {
    return forumBaseUrl.replace(/\/+$/, '') + '/assets/' + String(assetPath).replace(/^\/+/, '');
  }
  return String(assetPath);
};

const FALLBACK_COLORS = [
  '#f0b213', '#3f88f6', '#4ec46a', '#e84393', '#9b59b6',
  '#e67e22', '#1abc9c', '#e74c3c', '#2ecc71', '#3498db',
];

const FALLBACK_ICONS = [
  'fas fa-tag', 'fas fa-folder', 'fas fa-comments', 'fas fa-star',
  'fas fa-fire', 'fas fa-bolt', 'fas fa-globe', 'fas fa-heart',
];

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
    this.tagPickerOpen = false;
    this.composerSubmitting = false;
    this.composerProxy = null;

    // Preload tags
    if (app.tagList?.load) {
      app.tagList.load(['children', 'parent']).catch(() => {});
    }
  }

  navigate(event, href) {
    event.preventDefault();
    m.route.set(href);
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

  popularDiscussions(limit = 5) {
    return [...this.allDiscussions()]
      .sort((a, b) => this.discussionScore(b) - this.discussionScore(a))
      .slice(0, limit);
  }

  latestDiscussions() {
    return [...this.allDiscussions()]
      .sort((a, b) => {
        const aDate = a.lastPostedAt?.() ? new Date(a.lastPostedAt()) : new Date(0);
        const bDate = b.lastPostedAt?.() ? new Date(b.lastPostedAt()) : new Date(0);
        return bDate - aDate;
      })
      .slice(0, 10);
  }

  topCategories(limit = 7) {
    try {
      const tags = app.store.all('tags').filter((t) => {
        // primary tags only (no parent)
        return t && !t.parent?.();
      });
      return tags
        .sort((a, b) => numberOr(b.discussionCount?.(), 0) - numberOr(a.discussionCount?.(), 0))
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
    m.redraw();

    firstPost.save({ isLiked: !isLiked }).then(() => {
      this.likingIds.delete(id);
      m.redraw();
    }).catch(() => {
      this.likingIds.delete(id);
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
    m.redraw();
    setTimeout(() => {
      const el = document.querySelector('.AvocadoHome-composerTitle');
      if (el) el.focus();
    }, 50);
  }

  submitInlineComposer() {
    if (this.composerSubmitting) return;
    const title = this.composerTitle.trim();
    const body = this.composerBody.trim();
    if (!title || !body) return;

    this.composerSubmitting = true;
    m.redraw();

    const data = {
      title,
      content: body,
    };

    if (this.composerTags.length > 0) {
      data.relationships = {
        tags: this.composerTags.map((tag) => ({ type: 'tags', id: tag.id() })),
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
    const avatarUrl = user.avatarUrl?.();
    const username = displayName(user);
    const initial = avatarInitial(user);

    if (avatarUrl) {
      return (
        <img
          className={`AvocadoHome-avatar${className ? ' ' + className : ''}`}
          src={avatarUrl}
          alt={username}
          title={username}
        />
      );
    }

    return (
      <span
        className={`AvocadoHome-avatarFallback${className ? ' ' + className : ''}`}
        title={username}
        aria-hidden="true"
      >
        {initial}
      </span>
    );
  }

  renderReplyCard(discussion) {
    const lastPoster = discussion.lastPostedUser?.();
    const lastPost = discussion.lastPost?.();
    const replies = this.replyCount(discussion);
    if (!lastPoster && !lastPost) return null;

    const rawText = lastPost?.contentPlain?.() || '';
    const preview = rawText ? rawText.slice(0, 100) + (rawText.length > 100 ? '…' : '') : '';
    const otherCount = replies - 1;

    return (
      <div className="AvocadoHome-replyCard">
        <div className="AvocadoHome-replyCard-line">
          <div className="AvocadoHome-replyCard-avatar">
            {this.renderAvatar(lastPoster)}
          </div>
          <span className="AvocadoHome-replyCard-name">{displayName(lastPoster)}</span>
          {preview && <span className="AvocadoHome-replyCard-text">{preview}</span>}
        </div>
        {otherCount > 0 && (
          <span className="AvocadoHome-replyCard-seeMore">
            {trans('ramon-avocado.forum.home.see_other_replies', 'See other {count} replies', { count: otherCount })}
          </span>
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
    const tags = (discussion.tags?.() || []).filter(Boolean);
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
              <span className="AvocadoHome-threadAuthor">{displayName(user)}</span>
              {timeLabel && (
                <span className="AvocadoHome-threadTime">{timeLabel}</span>
              )}
              {isSticky && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--sticky">
                    <i className="fas fa-thumbtack" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {isFollowing && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_following', 'Following')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--following">
                    <i className="fas fa-star" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {tags.slice(0, 3).map((tag) => {
                const tagColor = tag.color?.() || FALLBACK_COLORS[0];
                return (
                  <a
                    key={tag.id?.()}
                    className="AvocadoHome-tagPill"
                    href={tagRoute(tag)}
                    onclick={(e) => { e.stopPropagation(); this.navigate(e, tagRoute(tag)); }}
                    style={{
                      '--tag-bg': hexToRgba(tagColor, 0.1),
                      '--tag-color': tagColor,
                    }}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                  </a>
                );
              })}
            </div>
            <a
              className="AvocadoHome-threadTitle"
              href={href}
              onclick={(e) => this.navigate(e, href)}
            >
              {title}
            </a>
            {excerpt && (
              <p className="AvocadoHome-threadExcerpt">{excerpt}</p>
            )}
          </div>
          <button
            className="AvocadoHome-replyBtn"
            title={trans('ramon-avocado.forum.home.reply', 'Reply')}
            onclick={(e) => {
              e.stopPropagation();
              m.route.set(href);
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
            className={`AvocadoHome-statBtn AvocadoHome-statBtn--likes${isLiked ? ' AvocadoHome-statBtn--liked' : ''}${isLiking ? ' AvocadoHome-statBtn--loading' : ''}`}
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
            <span>{likes}</span>
          </button>
          <button
            className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
            onclick={(e) => { e.stopPropagation(); m.route.set(href); }}
            title={trans('ramon-avocado.forum.home.replies', 'Replies')}
          >
            <i className="far fa-comment" aria-hidden="true" />
            <span>{replies}</span>
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

  renderTagPicker() {
    const allTags = app.store.all('tags').filter((t) => t && !t.parent?.());
    const selectedIds = new Set(this.composerTags.map((t) => t.id?.()));

    return (
      <div className="AvocadoHome-tagPicker">
        <button
          className={`AvocadoHome-tagPickerTrigger${this.tagPickerOpen ? ' is-open' : ''}`}
          type="button"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            this.tagPickerOpen = !this.tagPickerOpen;
            m.redraw();
          }}
        >
          <i className="fas fa-tag" aria-hidden="true" />
          {this.composerTags.length === 0
            ? <span className="AvocadoHome-tagPickerPlaceholder">
                {trans('ramon-avocado.forum.home.choose_tags', 'Choose tags')}
              </span>
            : this.composerTags.map((tag) => {
                const tagColor = tag.color?.() || FALLBACK_COLORS[0];
                return (
                  <span
                    key={tag.id?.()}
                    className="AvocadoHome-tagChip"
                    style={{ '--tag-color': tagColor }}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                    <button
                      className="AvocadoHome-tagChipRemove"
                      type="button"
                      onclick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.composerTags = this.composerTags.filter((t) => t.id?.() !== tag.id?.());
                        m.redraw();
                      }}
                      aria-label="Remove tag"
                    >
                      <i className="fas fa-times" aria-hidden="true" />
                    </button>
                  </span>
                );
              })
          }
          <i className={`fas fa-chevron-${this.tagPickerOpen ? 'up' : 'down'} AvocadoHome-tagPickerChevron`} aria-hidden="true" />
        </button>

        {this.tagPickerOpen && (
          <div className="AvocadoHome-tagPickerDropdown">
            {allTags.length === 0 && (
              <span className="AvocadoHome-tagPickerEmpty">
                {trans('ramon-avocado.forum.home.no_tags', 'No tags available')}
              </span>
            )}
            {allTags.map((tag) => {
              const tagId = tag.id?.();
              const isSelected = selectedIds.has(tagId);
              const tagColor = tag.color?.() || FALLBACK_COLORS[0];
              const count = numberOr(tag.discussionCount?.(), 0);

              return (
                <button
                  key={tagId}
                  className={`AvocadoHome-tagPickerItem${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  style={{ '--tag-color': tagColor }}
                  onclick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isSelected) {
                      this.composerTags = this.composerTags.filter((t) => t.id?.() !== tagId);
                    } else {
                      this.composerTags = [...this.composerTags, tag];
                    }
                    m.redraw();
                  }}
                >
                  <span className="AvocadoHome-tagPickerItem-icon">
                    {tag.icon?.()
                      ? <i className={tag.icon()} aria-hidden="true" />
                      : <i className="fas fa-tag" aria-hidden="true" />
                    }
                  </span>
                  <span className="AvocadoHome-tagPickerItem-name">{tag.name?.()}</span>
                  <span className="AvocadoHome-tagPickerItem-count">{formatThreadCount(count)}</span>
                  {isSelected && <i className="fas fa-check AvocadoHome-tagPickerItem-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  view() {
    const user = app.session.user;
    const heroImage = app.forum?.attribute('avocadoHeroImage');
    const heroUrl = heroImage ? resolveAssetUrl(heroImage) : null;
    const heroImagePosition = app.forum?.attribute('avocadoHeroImagePosition') || 'center top';
    const forumTitle = app.forum?.attribute('title') || '';
    const forumDesc = app.forum?.attribute('description') || '';

    const popular = this.popularDiscussions(5);
    const latest = this.latestDiscussions();
    const categories = this.topCategories(7);
    const extraCategories = Math.max(0, app.store.all('tags').filter((t) => !t.parent?.()).length - 4);

    const guestCTA = (
      <div className="AvocadoHome-guestCTA">
        <p>{trans('ramon-avocado.forum.home.guest_cta_text', 'Want to join the conversation?')}</p>
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
        <div className="AvocadoHome-main">

          {/* ── Hero banner ──────────────────────────────────────────────── */}
          {heroUrl && (
            <div
              className="AvocadoHome-heroBanner"
              style={{
                backgroundImage: `url(${heroUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: heroImagePosition,
              }}
            >
              <div className="AvocadoHome-heroBannerOverlay">
                <div className="container">
                  <h1 className="AvocadoHome-heroBannerTitle">{forumTitle}</h1>
                  {forumDesc && <p className="AvocadoHome-heroBannerDesc">{forumDesc}</p>}
                  {!user && guestCTA}
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
                  {trans('ramon-avocado.forum.home.start_discussion', "What's on your mind?")}
                </span>
                <div className="AvocadoHome-postInput-actions">
                  <span className="AvocadoHome-postInput-action">
                    <i className="fas fa-image" aria-hidden="true" />
                    {trans('ramon-avocado.forum.home.action_image', 'Image')}
                  </span>
                  <span className="AvocadoHome-postInput-action AvocadoHome-postInput-action--primary">
                    <i className="fas fa-pen" aria-hidden="true" />
                    {trans('ramon-avocado.forum.home.action_write', 'Write')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Inline composer ───────────────────────────────────────────── */}
          {this.composerOpen && (
            <div className="AvocadoHome-composer">
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
              <TextEditor
                className="AvocadoHome-composerBody"
                value={this.composerBody}
                placeholder={trans('ramon-avocado.forum.home.composer_body_placeholder', 'Share your thoughts…')}
                oninput={(value) => { this.composerBody = value; m.redraw(); }}
              />
              <div className="AvocadoHome-composer-footer">
                {this.renderTagPicker()}
                <div className="AvocadoHome-composer-footerActions">
                  <button
                    className="Button AvocadoHome-composer-cancel"
                    type="button"
                    onclick={() => {
                      this.composerOpen = false;
                      this.composerTitle = '';
                      this.composerBody = '';
                      this.composerTags = [];
                      this.tagPickerOpen = false;
                      m.redraw();
                    }}
                  >
                    {trans('ramon-avocado.forum.home.composer_cancel', 'Cancel')}
                  </button>
                  <button
                    className={`Button Button--primary AvocadoHome-composer-submit${this.composerSubmitting ? ' is-loading' : ''}`}
                    type="button"
                    disabled={this.composerSubmitting || !this.composerTitle.trim() || !this.composerBody.trim()}
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
          {categories.length > 0 && (
            <section className="AvocadoHome-section">
              <div className="AvocadoHome-sectionHead">
                <h2>{trans('ramon-avocado.forum.home.categories_heading', 'Categories')}</h2>
                <a
                  className="AvocadoHome-seeAll"
                  href={safeRoute('tags')}
                  onclick={(e) => this.navigate(e, safeRoute('tags'))}
                >
                  {trans('ramon-avocado.forum.home.see_all', 'See all')}{' '}
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </a>
              </div>
              <div className="AvocadoHome-categories">
                {categories.slice(0, 4).map((cat, idx) => {
                  const catColor = cat.color?.() || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
                  const catIcon = cat.icon?.() || FALLBACK_ICONS[idx % FALLBACK_ICONS.length];
                  const catRoute = tagRoute(cat);
                  const count = numberOr(cat.discussionCount?.(), 0);

                  return (
                    <a
                      key={cat.id?.()}
                      className="AvocadoHome-categoryCard"
                      href={catRoute}
                      onclick={(e) => this.navigate(e, catRoute)}
                      style={{ '--cat-color': catColor }}
                    >
                      <span className="AvocadoHome-categoryCard-icon">
                        <i className={catIcon} aria-hidden="true" />
                      </span>
                      <span className="AvocadoHome-categoryCard-text">
                        <span className="AvocadoHome-categoryCard-name">{cat.name?.()}</span>
                        <span className="AvocadoHome-categoryCard-count">
                          {formatThreadCount(count)} {trans('ramon-avocado.forum.home.threads', 'threads')}
                        </span>
                      </span>
                    </a>
                  );
                })}
                {extraCategories > 0 && (
                  <a
                    className="AvocadoHome-categoryCard AvocadoHome-categoryCard--more"
                    href={safeRoute('tags')}
                    onclick={(e) => this.navigate(e, safeRoute('tags'))}
                  >
                    <span className="AvocadoHome-categoryCard-icon">
                      <i className="fas fa-ellipsis-h" aria-hidden="true" />
                    </span>
                    <span className="AvocadoHome-categoryCard-text">
                      <span className="AvocadoHome-categoryCard-name">
                        +{extraCategories} {trans('ramon-avocado.forum.home.more', 'more')}
                      </span>
                    </span>
                  </a>
                )}
              </div>
            </section>
          )}

          {/* ── Popular discussions ───────────────────────────────────────── */}
          <section className="AvocadoHome-section">
            <div className="AvocadoHome-sectionHead">
              <h2>{trans('ramon-avocado.forum.home.popular_heading', 'Popular discussions')}</h2>
            </div>
            <div className="AvocadoHome-threadStack">
              {popular.length === 0
                ? this.renderSkeleton()
                : popular.map((d) => this.renderThreadCard(d))
              }
            </div>
          </section>

          {/* ── All discussions ───────────────────────────────────────────── */}
          <section className="AvocadoHome-section">
            <div className="AvocadoHome-sectionHead">
              <h2>{trans('ramon-avocado.forum.home.all_heading', 'All discussions')}</h2>
              <a
                className="AvocadoHome-seeAll"
                href={safeRoute('index')}
                onclick={(e) => this.navigate(e, safeRoute('index'))}
              >
                {trans('ramon-avocado.forum.home.see_all', 'See all')}
              </a>
            </div>
            <div className="AvocadoHome-threadStack">
              {latest.length === 0
                ? this.renderSkeleton()
                : latest.map((d) => this.renderThreadCard(d))
              }
            </div>
          </section>

          {/* ── Guest CTA (bottom) ────────────────────────────────────────── */}
          {!user && !heroUrl && guestCTA}

        </div>
      </div>
    );
  }
}
