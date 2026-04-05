import app from 'flarum/forum/app';
import UserPage from 'flarum/forum/components/UserPage';
import Avatar from 'flarum/common/components/Avatar';
import AvatarEditor from 'flarum/forum/components/AvatarEditor';
import Dropdown from 'flarum/common/components/Dropdown';
import UserControls from 'flarum/forum/utils/UserControls';
import listItems from 'flarum/common/helpers/listItems';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import LinkButton from 'flarum/common/components/LinkButton';

import {
  trans,
  displayName,
  tagPillStyle,
  FALLBACK_COLORS,
  discussionRoute,
  tagRoute,
  formatTimeLabel,
  truncate,
  postPreview as postExcerpt,
  navigate,
  userRoute,
  renderThreadSkeleton,
  renderLoadMore,
  renderEmpty,
} from '../utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const findBySlug = (slug) => {
  const l = slug.toLowerCase();
  return app.store.all('users').find(
    (u) => (u.slug?.() || '').toLowerCase() === l || (u.username?.() || '').toLowerCase() === l
  ) || null;
};

const PAGE_SIZE = 20;

// ─── Thread card (same visual as AllDiscussionsPage) ──────────────────────────

function renderThreadCard(discussion, likingIds, toggleLike) {
  if (!discussion) return null;
  const id        = discussion.id?.();
  const user      = discussion.user?.();
  const title     = discussion.title?.() || 'Untitled';
  const href      = discussionRoute(discussion);
  const tags      = (discussion.tags?.() || []).filter(Boolean);
  const isSticky  = discussion.isSticky?.() || false;
  const isFollowing = discussion.subscription?.() === 'follow';
  const isUnread  = discussion.isUnread?.() || false;
  const replies   = Number(discussion.replyCount?.()) || 0;
  const likes     = Number(discussion.firstPost?.()?.attribute?.('likesCount')) || 0;
  const isLiked   = app.session.user && (discussion.firstPost?.()?.likes?.() || []).some((u) => u === app.session.user);
  const isLiking  = likingIds.has(id);
  const excerpt   = postExcerpt(discussion);
  const timeLabel = formatTimeLabel(discussion.lastPostedAt?.());
  const userHref  = userRoute(user);

  const lastPoster = discussion.lastPostedUser?.();
  const lastPost   = discussion.lastPost?.();
  const replyCard  = (() => {
    if (!replies || (!lastPoster && !lastPost)) return null;
    const rawText   = lastPost?.contentPlain?.() || '';
    const preview   = truncate(rawText, 100);
    const otherCount = replies - 1;
    const lastPostHref = (() => {
      try { const n = discussion.lastPostNumber?.(); return n ? app.route.discussion(discussion, n) : href; }
      catch (e) { return href; }
    })();
    const secondHref = (() => {
      try { return app.route.discussion(discussion, 2); } catch (e) { return href; }
    })();
    return (
      <div className="AvocadoHome-replyCard">
        <a className="AvocadoHome-replyCard-line" href={lastPostHref}
           onclick={(e) => { e.stopPropagation(); navigate(e, lastPostHref); }}>
          <div className="AvocadoHome-replyCard-avatar">{lastPoster && <Avatar user={lastPoster} />}</div>
          <span className="AvocadoHome-replyCard-name">{displayName(lastPoster)}</span>
          {preview && <span className="AvocadoHome-replyCard-text">{preview}</span>}
        </a>
        {otherCount > 0 && (
          <a className="AvocadoHome-replyCard-seeMore" href={secondHref}
             onclick={(e) => { e.stopPropagation(); navigate(e, secondHref); }}>
            {otherCount === 1 ? trans('ramon-avocado.forum.home.see_other_reply_singular', 'See other {count} reply', { count: otherCount }) : trans('ramon-avocado.forum.home.see_other_replies', 'See other {count} replies', { count: otherCount })}
          </a>
        )}
      </div>
    );
  })();

  return (
    <article key={id} className={`AvocadoHome-threadCard${isUnread ? ' AvocadoHome-threadCard--unread' : ''}`}>
      <div className="AvocadoHome-threadHead">
        <div className="AvocadoHome-avatarWrap">{user && <Avatar user={user} />}</div>
        <div className="AvocadoHome-threadMain">
          <div className="AvocadoHome-threadMeta">
            <a className="AvocadoHome-threadAuthor" href={userHref}
               onclick={(e) => { e.stopPropagation(); navigate(e, userHref); }}>
              {displayName(user)}
            </a>
            {timeLabel && <span className="AvocadoHome-threadTime">{timeLabel}</span>}
            {isSticky && (
              <span className="AvocadoHome-badge AvocadoHome-badge--sticky">
                <i className="fas fa-thumbtack" aria-hidden="true" />
              </span>
            )}
            {isFollowing && (
              <span className="AvocadoHome-badge AvocadoHome-badge--following">
                <i className="fas fa-star" aria-hidden="true" />
              </span>
            )}
            {tags.slice(0, 3).map((tag) => {
              const c = tag.color?.() || FALLBACK_COLORS[0];
              const href2 = tagRoute(tag);
              return (
                <a key={tag.id?.()} className="AvocadoHome-tagPill"
                   href={href2}
                   onclick={(e) => { e.stopPropagation(); navigate(e, href2); }}
                   style={tagPillStyle(c)}>
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name?.()}
                </a>
              );
            })}
          </div>
          <a className="AvocadoHome-threadTitle" href={href} onclick={(e) => navigate(e, href)}>
            {title}
          </a>
          {excerpt && <p className="AvocadoHome-threadExcerpt">{excerpt}</p>}
        </div>
        <button className="AvocadoHome-replyBtn"
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
          }}>
          <i className="fas fa-reply" aria-hidden="true" />Reply
        </button>
      </div>
      {replies > 0 && <div className="AvocadoHome-threadReplyGroup">{replyCard}</div>}
      <div className="AvocadoHome-threadStats">
        <button
          className={`AvocadoHome-statBtn AvocadoHome-statBtn--likes${isLiked ? ' AvocadoHome-statBtn--liked' : ''}${isLiking ? ' AvocadoHome-statBtn--loading' : ''}`}
          onclick={(e) => {
            e.stopPropagation();
            if (!app.session.user) {
              app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default));
              return;
            }
            toggleLike(discussion);
          }}>
          <i className={isLiked ? 'fas fa-thumbs-up' : 'far fa-thumbs-up'} aria-hidden="true" />
          <span>{likes === 1 ? trans('ramon-avocado.forum.home.like_count_singular', '1 like') : trans('ramon-avocado.forum.home.like_count_plural', '{count} likes', { count: likes })}</span>
        </button>
        <button className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
          onclick={(e) => { e.stopPropagation(); m.route.set(href); }}>
          <i className="far fa-comment" aria-hidden="true" />
          <span>{replies === 1 ? trans('ramon-avocado.forum.home.reply_count_singular', '1 resposta') : trans('ramon-avocado.forum.home.reply_count_plural', '{count} respostas', { count: replies })}</span>
        </button>
      </div>
    </article>
  );
}

// ─── Post card (user's comment within a discussion) ───────────────────────────

function renderPostCard(post) {
  if (!post) return null;
  const id         = post.id?.();
  const discussion = post.discussion?.();
  const user       = post.user?.();
  if (!discussion) return null;

  const title     = discussion.title?.() || 'Untitled';
  const postNum   = post.number?.();
  const href      = (() => {
    try { return app.route.discussion(discussion, postNum); } catch (e) { return discussionRoute(discussion); }
  })();
  const tags      = (discussion.tags?.() || []).filter(Boolean);
  const timeLabel = formatTimeLabel(post.createdAt?.());
  const userHref  = userRoute(user);
  const plain     = post.contentPlain?.() || '';
  const excerpt   = plain ? truncate(plain, 200) : '';
  const replies   = Number(discussion.replyCount?.()) || 0;

  return (
    <article key={id} className="AvocadoHome-threadCard">
      <div className="AvocadoHome-threadHead">
        <div className="AvocadoHome-avatarWrap">{user && <Avatar user={user} />}</div>
        <div className="AvocadoHome-threadMain">
          <div className="AvocadoHome-threadMeta">
            <a className="AvocadoHome-threadAuthor" href={userHref}
               onclick={(e) => { e.stopPropagation(); navigate(e, userHref); }}>
              {displayName(user)}
            </a>
            {timeLabel && <span className="AvocadoHome-threadTime">{timeLabel}</span>}
            {tags.slice(0, 2).map((tag) => {
              const c = tag.color?.() || FALLBACK_COLORS[0];
              return (
                <a key={tag.id?.()} className="AvocadoHome-tagPill"
                   href={tagRoute(tag)}
                   onclick={(e) => { e.stopPropagation(); navigate(e, tagRoute(tag)); }}
                   style={tagPillStyle(c)}>
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name?.()}
                </a>
              );
            })}
          </div>
          <a className="AvocadoHome-threadTitle" href={href} onclick={(e) => navigate(e, href)}>
            {title}
          </a>
          {excerpt && <p className="AvocadoHome-threadExcerpt AvocadoUserPage-postExcerpt">{excerpt}</p>}
        </div>
        <a className="AvocadoHome-replyBtn" href={href}
           onclick={(e) => { e.stopPropagation(); navigate(e, href); }}>
          <i className="fas fa-arrow-right" aria-hidden="true" />View
        </a>
      </div>
      <div className="AvocadoHome-threadStats">
        <span className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
              onclick={(e) => { e.stopPropagation(); m.route.set(href); }}>
          <i className="far fa-comment" aria-hidden="true" />
          <span>{replies === 1 ? `${replies} reply` : `${replies} replies`}</span>
        </span>
      </div>
    </article>
  );
}



// ─── Shared: hero ─────────────────────────────────────────────────────────────

export function buildHero(user, isEditable, controls = []) {
  if (!user) {
    return (
      <div className="AvocadoUserPage-hero AvocadoUserPage-hero--skeleton">
        <div className="AvocadoUserPage-hero-inner">
          <div className="AvocadoUserPage-hero-row">
            <div className="AvocadoUserPage-shimmer AvocadoUserPage-shimmer--avatar" />
            <div style={{ flex: 1 }}>
              <div className="AvocadoUserPage-shimmer AvocadoUserPage-shimmer--name" />
              <div className="AvocadoUserPage-shimmer AvocadoUserPage-shimmer--meta" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const color          = user.color?.() || '#5a6480';
  const badges         = user.badges?.().toArray?.() || [];
  const isOnline       = user.isOnline?.();
  const joinTime       = user.joinTime?.();
  const commentCount   = user.commentCount?.();
  const discussionCount = user.discussionCount?.();
  const joinLabel      = joinTime
    ? new Date(joinTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="AvocadoUserPage-hero" style={{ '--user-color': color }}>
      <div className="AvocadoUserPage-hero-inner">
        <div className="AvocadoUserPage-hero-row">
          <div className="AvocadoUserPage-hero-avatarWrap">
            {isEditable
              ? <AvatarEditor user={user} />
              : <Avatar user={user} loading="eager" />
            }
            {isOnline && <span className="AvocadoUserPage-onlineDot" />}
          </div>
          <div className="AvocadoUserPage-hero-info">
            <h1 className="AvocadoUserPage-hero-name">{user.displayName?.() || user.username?.()}</h1>
            {badges.length > 0 && (
              <ul className="AvocadoUserPage-hero-badges badges">{listItems(badges)}</ul>
            )}
            <div className="AvocadoUserPage-hero-stats">
              {isOnline && (
                <span className="AvocadoUserPage-hero-statPill AvocadoUserPage-hero-statPill--online">
                  <i className="fas fa-circle" aria-hidden="true" />Online
                </span>
              )}
              {joinLabel && (
                <span className="AvocadoUserPage-hero-statPill">
                  Joined {joinLabel}
                </span>
              )}
            </div>
          </div>
          {controls.length > 0 && (
            <div className="AvocadoUserPage-hero-controls">
              <Dropdown
                buttonClassName="Button AvocadoUserPage-controlsBtn"
                menuClassName="Dropdown-menu--right"
                label={app.translator.trans('core.forum.user_controls.button')}
              >
                {controls}
              </Dropdown>
            </div>
          )}
        </div>
        {/* FoF User Bio — rendered below the avatar/name row inside the hero */}
        {(() => {
          try {
            const UserBio = flarum.reg.get('fof-user-bio', 'forum/components/UserBio');
            if (UserBio && user.attribute('canViewBio')) {
              return (
                <div className="AvocadoUserPage-hero-bio">
                  <UserBio user={user} editable={isEditable} />
                </div>
              );
            }
          } catch (_) {}
          return null;
        })()}
      </div>
    </div>
  );
}

// ─── Scrollable nav wrapper ───────────────────────────────────────────────────
// Wraps AvocadoUserPage-navInner with left/right arrow buttons that appear
// when nav items overflow the available width. Also supports drag-to-scroll.

class ScrollableNav {
  oninit() {
    this._el          = null;
    this._canLeft     = false;
    this._canRight    = false;
    this._dragging    = false;
    this._startX      = 0;
    this._scrollLeft0 = 0;
    this._ro          = null;
  }

  _check() {
    const el = this._el;
    if (!el) return;
    const l = el.scrollLeft > 1;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    if (l !== this._canLeft || r !== this._canRight) {
      this._canLeft  = l;
      this._canRight = r;
      m.redraw();
    }
  }

  _scroll(dir) {
    this._el && this._el.scrollBy({ left: dir * 160, behavior: 'smooth' });
  }

  oncreate(vnode) {
    const el = vnode.dom.querySelector('.AvocadoUserPage-navInner');
    this._el = el;
    if (!el) return;

    this._handleScroll    = () => this._check();
    this._handleMouseDown = (e) => {
      this._dragging    = true;
      this._startX      = e.pageX - el.offsetLeft;
      this._scrollLeft0 = el.scrollLeft;
      document.documentElement.style.cursor     = 'grabbing';
      document.documentElement.style.userSelect = 'none';
    };
    this._handleMouseMove = (e) => {
      if (!this._dragging) return;
      e.preventDefault();
      el.scrollLeft = this._scrollLeft0 - (e.pageX - el.offsetLeft - this._startX);
    };
    this._handleMouseUp = () => {
      if (!this._dragging) return;
      this._dragging = false;
      document.documentElement.style.cursor     = '';
      document.documentElement.style.userSelect = '';
    };

    el.addEventListener('scroll', this._handleScroll, { passive: true });
    el.addEventListener('mousedown', this._handleMouseDown);
    window.addEventListener('mousemove', this._handleMouseMove);
    window.addEventListener('mouseup', this._handleMouseUp);

    this._ro = new ResizeObserver(() => this._check());
    this._ro.observe(el);
    this._check();
  }

  onremove() {
    const el = this._el;
    if (el) {
      el.removeEventListener('scroll', this._handleScroll);
      el.removeEventListener('mousedown', this._handleMouseDown);
    }
    window.removeEventListener('mousemove', this._handleMouseMove);
    window.removeEventListener('mouseup', this._handleMouseUp);
    this._ro && this._ro.disconnect();
    this._el = null;
  }

  view(vnode) {
    return (
      <div className="AvocadoUserPage-nav">
        <button
          className={`AvocadoUserPage-navArrow AvocadoUserPage-navArrow--left${this._canLeft ? ' is-visible' : ''}`}
          onclick={() => this._scroll(-1)}
          aria-label="Scroll left"
          tabindex="-1"
        >
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>
        {vnode.children}
        <button
          className={`AvocadoUserPage-navArrow AvocadoUserPage-navArrow--right${this._canRight ? ' is-visible' : ''}`}
          onclick={() => this._scroll(1)}
          aria-label="Scroll right"
          tabindex="-1"
        >
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </button>
      </div>
    );
  }
}

// ─── Shared: sticky horizontal nav tabs ──────────────────────────────────────
// Accepts a page instance (AvocadoUserBase or UserPage subclass) so that
// navItems() is called on the real instance, picking up any extension that
// used extend(UserPage.prototype, 'navItems', …).

export function buildSidebar(page) {
  const user = page?.user;
  if (!user) {
    return (
      <div className="AvocadoUserPage-nav">
        <div className="AvocadoUserPage-navInner">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="AvocadoUserPage-shimmer AvocadoUserPage-shimmer--navItem" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollableNav>
      <ul className="AvocadoUserPage-navInner">
        {listItems(page.navItems().toArray())}
      </ul>
    </ScrollableNav>
  );
}

// ─── Profile mobile nav ───────────────────────────────────────────────────────
// Always renders App-titleControl so it is in the DOM from the very first render
// (even before user data loads). This prevents the race condition where the
// absolutely-positioned SelectDropdown misses the phone header on first paint.

export function buildUserPhoneNav(page) {
  // navItems() requires this.user — only call it when user is ready.
  const user = page?.user;
  const items = user ? page.navItems().toArray() : [];

  return (
    <nav className="IndexPage-nav sideNav">
      <ul>
        <li className="item item-nav">
          <SelectDropdown className="App-titleControl" buttonClassName="Button">
            {items}
          </SelectDropdown>
        </li>
      </ul>
    </nav>
  );
}

// ─── Base page ────────────────────────────────────────────────────────────────
// Extends native UserPage so that navItems() picks up every extension that calls
// extend(UserPage.prototype, 'navItems', …) — e.g. fof/badges, fof/user-bio, etc.

class AvocadoUserBase extends UserPage {

  oninit(vnode) {
    super.oninit(vnode); // sets this.bodyClass = 'App--user'
    this.userLoading = true;
    this.loadUser(m.route.param('username'));
  }

  loadUser(slug) {
    if (!slug) return;
    const cached = findBySlug(slug);
    if (cached?.joinTime?.()) {
      this.user = cached;
      app.current.set('user', cached);
      this.userLoading = false;
      this.onUserLoaded(cached);
      return;
    }
    app.store.find('users', slug, { bySlug: true })
      .then((user) => {
        this.user = user;
        app.current.set('user', user);
        this.userLoading = false;
        this.onUserLoaded(user);
        m.redraw();
      })
      .catch(() => { this.userLoading = false; m.redraw(); });
  }

  onUserLoaded(user) {}

  content() { return null; }

  view() {
    const user       = this.user;
    const isEditable = user && (user.canEdit?.() || user === app.session.user);
    const controls   = user ? UserControls.controls(user, this).toArray() : [];

    return (
      <div className="AvocadoUserPage">
        <div className="AvocadoNav-helper">{buildUserPhoneNav(this)}</div>
        {buildHero(user, isEditable, controls)}
        {buildSidebar(this)}
        <div className="AvocadoUserPage-body">
          <div className="AvocadoUserPage-bodyInner">
            {this.userLoading
              ? <div className="AvocadoHome-threadStack">{renderThreadSkeleton()}</div>
              : this.content()
            }
          </div>
        </div>
      </div>
    );
  }
}

// ─── Posts page (/u/:username) — user's comments ──────────────────────────────

export class AvocadoUserPostsPage extends AvocadoUserBase {
  oninit(vnode) {
    // Initialize state BEFORE super.oninit so onUserLoaded can use it
    this.posts   = [];
    this.loading = false;
    this.hasMore = false;
    this.offset  = 0;
    super.oninit(vnode);
  }

  activeKey() { return 'posts'; }

  onUserLoaded(user) { this._user = user; this.loadPosts(true); }

  loadPosts(reset = false) {
    const user = this._user;
    if (!user || this.loading) return;
    if (reset) { this.posts = []; this.offset = 0; this.hasMore = false; }
    this.loading = true;
    m.redraw();
    app.store.find('posts', {
      filter: { author: user.username(), type: 'comment' },
      sort: '-createdAt',
      page: { offset: this.offset, limit: PAGE_SIZE },
      include: 'user,discussion,discussion.tags,discussion.firstPost',
    }).then((results) => {
      const items = Array.isArray(results) ? results : [];
      this.posts   = reset ? [...items] : [...this.posts, ...items];
      this.hasMore = !!(results.payload?.links?.next);
      this.offset += items.length;
      this.loading = false;
      m.redraw();
    }).catch(() => { this.loading = false; m.redraw(); });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.posts.map((p) => renderPostCard(p))}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No posts yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}

// ─── Discussions page (/u/:username/discussions) ──────────────────────────────

export class AvocadoUserDiscussionsPage extends AvocadoUserBase {
  oninit(vnode) {
    this.discussions = [];
    this.loading     = false;
    this.hasMore     = false;
    this.offset      = 0;
    this.likingIds   = new Set();
    super.oninit(vnode);
  }

  activeKey() { return 'discussions'; }

  onUserLoaded(user) { this._user = user; this.loadDiscussions(true); }

  loadDiscussions(reset = false) {
    const user = this._user;
    if (!user || this.loading) return;
    if (reset) { this.discussions = []; this.offset = 0; this.hasMore = false; }
    this.loading = true;
    m.redraw();
    app.store.find('discussions', {
      filter: { author: user.username() },
      sort: '-createdAt',
      page: { offset: this.offset, limit: PAGE_SIZE },
      include: 'user,firstPost,lastPostedUser,lastPost,tags',
    }).then((results) => {
      const items      = Array.isArray(results) ? results : [];
      this.discussions = reset ? [...items] : [...this.discussions, ...items];
      this.hasMore     = !!(results.payload?.links?.next);
      this.offset     += items.length;
      this.loading     = false;
      m.redraw();
    }).catch(() => { this.loading = false; m.redraw(); });
  }

  toggleLike(discussion) {
    const firstPost = discussion.firstPost?.();
    if (!firstPost) return;
    const id = discussion.id?.();
    if (this.likingIds.has(id)) return;
    const isLiked = app.session.user && (firstPost.likes?.() || []).some((u) => u === app.session.user);
    this.likingIds.add(id);
    m.redraw();
    firstPost.save({ isLiked: !isLiked })
      .then(() => { this.likingIds.delete(id); m.redraw(); })
      .catch(() => { this.likingIds.delete(id); m.redraw(); });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.discussions.map((d) =>
          renderThreadCard(d, this.likingIds, (d) => this.toggleLike(d))
        )}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.discussions.length === 0 && renderEmpty('No discussions yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadDiscussions(false))}
      </div>
    );
  }
}

// ─── Likes page (/u/:username/likes) ─────────────────────────────────────────

export class AvocadoUserLikesPage extends AvocadoUserBase {
  oninit(vnode) {
    this.posts   = [];
    this.loading = false;
    this.hasMore = false;
    this.offset  = 0;
    super.oninit(vnode);
  }

  activeKey() { return 'likes'; }

  onUserLoaded(user) { this._user = user; this.loadPosts(true); }

  loadPosts(reset = false) {
    const user = this._user;
    if (!user || this.loading) return;
    if (reset) { this.posts = []; this.offset = 0; this.hasMore = false; }
    this.loading = true;
    m.redraw();
    app.store.find('posts', {
      filter: { type: 'comment', likedBy: user.id() },
      sort: '-createdAt',
      page: { offset: this.offset, limit: PAGE_SIZE },
      include: 'user,discussion,discussion.tags,discussion.firstPost',
    }).then((results) => {
      const items  = Array.isArray(results) ? results : [];
      this.posts   = reset ? [...items] : [...this.posts, ...items];
      this.hasMore = !!(results.payload?.links?.next);
      this.offset += items.length;
      this.loading = false;
      m.redraw();
    }).catch(() => { this.loading = false; m.redraw(); });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.posts.map((p) => renderPostCard(p))}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No liked posts yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}

// ─── Mentions page (/u/:username/mentions) ────────────────────────────────────

export class AvocadoUserMentionsPage extends AvocadoUserBase {
  oninit(vnode) {
    this.posts   = [];
    this.loading = false;
    this.hasMore = false;
    this.offset  = 0;
    super.oninit(vnode);
  }

  activeKey() { return 'mentions'; }

  onUserLoaded(user) { this._user = user; this.loadPosts(true); }

  loadPosts(reset = false) {
    const user = this._user;
    if (!user || this.loading) return;
    if (reset) { this.posts = []; this.offset = 0; this.hasMore = false; }
    this.loading = true;
    m.redraw();
    app.store.find('posts', {
      filter: { type: 'comment', mentioned: user.id() },
      sort: '-createdAt',
      page: { offset: this.offset, limit: PAGE_SIZE },
      include: 'user,discussion,discussion.tags,discussion.firstPost',
    }).then((results) => {
      const items  = Array.isArray(results) ? results : [];
      this.posts   = reset ? [...items] : [...this.posts, ...items];
      this.hasMore = !!(results.payload?.links?.next);
      this.offset += items.length;
      this.loading = false;
      m.redraw();
    }).catch(() => { this.loading = false; m.redraw(); });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.posts.map((p) => renderPostCard(p))}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No mentions yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}
