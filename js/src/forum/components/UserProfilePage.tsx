// @ts-nocheck
import app from 'flarum/forum/app';
import UserPage from 'flarum/forum/components/UserPage';
import Avatar from 'flarum/common/components/Avatar';
import AvatarEditor from 'flarum/forum/components/AvatarEditor';
import Dropdown from 'flarum/common/components/Dropdown';
import Tooltip from 'flarum/common/components/Tooltip';
import UserControls from 'flarum/forum/utils/UserControls';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import listItems from 'flarum/common/helpers/listItems';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import {
  trans,
  displayName,
  tagPillStyle,
  FALLBACK_COLORS,
  discussionRoute,
  tagRoute,
  formatTimeLabel,
  truncate,
  navigate,
  userRoute,
  renderThreadSkeleton,
  renderLoadMore,
  renderEmpty,
} from '../utils';
import ThreadCard from './shared/ThreadCard';

const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const findBySlug = (slug: string): any => {
  const l = slug.toLowerCase();
  return app.store.all('users').find(
    (u: any) => (u.slug?.() || '').toLowerCase() === l || (u.username?.() || '').toLowerCase() === l
  ) || null;
};

// ─── Post card (user's comment within a discussion) ───────────────────────────
// Different from ThreadCard: shows a post inside a discussion, not a standalone discussion.

function PostCard({ post, context }: { post: any; context: any }) {
  if (!post) return null;
  const discussion = post.discussion?.();
  if (!discussion) return null;

  const id         = post.id?.() as string;
  const user       = post.user?.();
  const title      = (discussion.title?.() || 'Untitled') as string;
  const postNum    = post.number?.();
  const href       = (() => {
    try { return app.route.discussion(discussion, postNum); } catch { return discussionRoute(discussion); }
  })();
  const tags       = ((discussion.tags?.() || []) as any[]).filter(Boolean);
  const timeLabel  = formatTimeLabel(post.createdAt?.());
  const userHref   = userRoute(user);
  const excerpt    = truncate((post.contentPlain?.() || '') as string, 200);
  const replies    = Number(discussion.replyCount?.()) || 0;
  const isLocked   = discussion.isLocked?.() || false;
  const isSticky   = discussion.isSticky?.() || false;
  const controls   = DiscussionControls.controls(discussion, context).toArray();

  return (
    <article key={id} className="AvocadoHome-threadCard">
      <div className="AvocadoHome-threadHead">
        <div className="AvocadoHome-avatarWrap">{user && <Avatar user={user} />}</div>
        <div className="AvocadoHome-threadMain">
          <div className="AvocadoHome-threadMeta">
            <a className="AvocadoHome-threadAuthor" href={userHref}
               onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, userHref); }}>
              {displayName(user)}
            </a>
            {timeLabel && <span className="AvocadoHome-threadTime">{timeLabel}</span>}
            {isSticky && (
              <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="top">
                <span className="AvocadoHome-badge AvocadoHome-badge--sticky">
                  <i className="fas fa-thumbtack" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {isLocked && (
              <Tooltip text={app.translator.trans('flarum-lock.forum.badge.locked_tooltip') as string} position="top">
                <span className="AvocadoHome-badge AvocadoHome-badge--locked">
                  <i className="fas fa-lock" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
            {tags.slice(0, 2).map((tag: any) => {
              const c = tag.color?.() || FALLBACK_COLORS[0];
              return (
                <a key={tag.id?.()} className="AvocadoHome-tagPill"
                   href={tagRoute(tag)}
                   onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, tagRoute(tag)); }}
                   style={tagPillStyle(c)}>
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name?.()}
                </a>
              );
            })}
          </div>
          <a className="AvocadoHome-threadTitle" href={href} onclick={(e: Event) => navigate(e as MouseEvent, href)}>
            {title}
          </a>
          {excerpt && <p className="AvocadoHome-threadExcerpt AvocadoUserPage-postExcerpt">{excerpt}</p>}
        </div>
        <div className="AvocadoHome-threadActions">
          {controls.length > 0 && (
            <Dropdown
              className="AvocadoHome-threadControls"
              icon="fas fa-ellipsis-v"
              buttonClassName="Button Button--icon Button--flat AvocadoHome-threadControls-toggle"
              accessibleToggleLabel={app.translator.trans('core.forum.discussion_controls.toggle_dropdown_accessible_label') as string}
            >
              {controls}
            </Dropdown>
          )}
          <a className="AvocadoHome-replyBtn" href={href}
             onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, href); }}>
            <i className="fas fa-arrow-right" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.view', 'View')}
          </a>
        </div>
      </div>
      <div className="AvocadoHome-threadStats">
        <span className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
              onclick={(e: Event) => { e.stopPropagation(); m.route.set(href); }}>
          <i className="far fa-comment" aria-hidden="true" />
          <span>{replies === 1
            ? trans('ramon-avocado.forum.home.reply_singular', '1 reply')
            : trans('ramon-avocado.forum.home.reply_plural', '{count} replies', { count: replies })}
          </span>
        </span>
      </div>
    </article>
  );
}

// ─── Shared: hero ─────────────────────────────────────────────────────────────

export function buildHero(user: any, isEditable: boolean, controls: any[] = []) {
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

  const color           = user.color?.() || '#5a6480';
  const badges          = user.badges?.().toArray?.() || [];
  const isOnline        = user.isOnline?.();
  const joinTime        = user.joinTime?.();
  const joinLabel       = joinTime
    ? new Date(joinTime as string).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="AvocadoUserPage-hero" style={{ '--user-color': color }}>
      <div className="AvocadoUserPage-hero-inner">
        <div className="AvocadoUserPage-hero-row">
          <div className="AvocadoUserPage-hero-avatarWrap">
            {isEditable ? <AvatarEditor user={user} /> : <Avatar user={user} loading="eager" />}
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
                <span className="AvocadoUserPage-hero-statPill">Joined {joinLabel}</span>
              )}
            </div>
          </div>
          {controls.length > 0 && (
            <div className="AvocadoUserPage-hero-controls">
              <Dropdown
                buttonClassName="Button AvocadoUserPage-controlsBtn"
                menuClassName="Dropdown-menu--right"
                label={app.translator.trans('core.forum.user_controls.button') as string}
              >
                {controls}
              </Dropdown>
            </div>
          )}
        </div>
        {(() => {
          try {
            const UserBio = (flarum as any).reg.get('fof-user-bio', 'forum/components/UserBio');
            if (UserBio && user.attribute('canViewBio')) {
              return <div className="AvocadoUserPage-hero-bio"><UserBio user={user} editable={isEditable} /></div>;
            }
          } catch { }
          return null;
        })()}
      </div>
    </div>
  );
}

// ─── Scrollable nav ───────────────────────────────────────────────────────────

class ScrollableNav {
  private _el: Element | null = null;
  private _canLeft  = false;
  private _canRight = false;
  private _dragging = false;
  private _startX   = 0;
  private _scrollLeft0 = 0;
  private _ro: ResizeObserver | null = null;
  private _handleScroll: (() => void) | null = null;
  private _handleMouseDown: ((e: MouseEvent) => void) | null = null;
  private _handleMouseMove: ((e: MouseEvent) => void) | null = null;
  private _handleMouseUp: (() => void) | null = null;

  private _check() {
    const el = this._el as HTMLElement;
    if (!el) return;
    const l = el.scrollLeft > 1;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    if (l !== this._canLeft || r !== this._canRight) {
      this._canLeft  = l;
      this._canRight = r;
      m.redraw();
    }
  }

  private _scroll(dir: number) {
    (this._el as HTMLElement)?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  }

  oncreate(vnode: any) {
    const el = vnode.dom.querySelector('.AvocadoUserPage-navInner') as HTMLElement;
    this._el = el;
    if (!el) return;

    this._handleScroll    = () => this._check();
    this._handleMouseDown = (e: MouseEvent) => {
      this._dragging    = true;
      this._startX      = e.pageX - el.offsetLeft;
      this._scrollLeft0 = el.scrollLeft;
      document.documentElement.style.cursor     = 'grabbing';
      document.documentElement.style.userSelect = 'none';
    };
    this._handleMouseMove = (e: MouseEvent) => {
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

    el.addEventListener('scroll',     this._handleScroll!,    { passive: true });
    el.addEventListener('mousedown',  this._handleMouseDown!);
    window.addEventListener('mousemove', this._handleMouseMove!);
    window.addEventListener('mouseup',   this._handleMouseUp!);

    this._ro = new ResizeObserver(() => this._check());
    this._ro.observe(el);
    this._check();
  }

  onremove() {
    if (this._el) {
      this._el.removeEventListener('scroll',    this._handleScroll!);
      this._el.removeEventListener('mousedown', this._handleMouseDown!);
    }
    window.removeEventListener('mousemove', this._handleMouseMove!);
    window.removeEventListener('mouseup',   this._handleMouseUp!);
    this._ro?.disconnect();
    this._el = null;
  }

  view(vnode: any) {
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

// ─── Shared nav builders ──────────────────────────────────────────────────────

export function buildSidebar(page: any) {
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

export function buildUserPhoneNav(page: any) {
  const user  = page?.user;
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

class AvocadoUserBase extends UserPage {
  protected userLoading = true;
  protected _user: any  = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.userLoading = true;
    this.loadUser(m.route.param('username'));
  }

  loadUser(slug: string) {
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
      .then((user: any) => {
        this.user = user;
        app.current.set('user', user);
        this.userLoading = false;
        this.onUserLoaded(user);
        m.redraw();
      })
      .catch(() => { this.userLoading = false; m.redraw(); });
  }

  onUserLoaded(_user: any) {}

  content(): any { return null; }

  view() {
    const user       = (this as any).user;
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

// ─── Posts page ───────────────────────────────────────────────────────────────

export class AvocadoUserPostsPage extends AvocadoUserBase {
  private posts: any[]  = [];
  private loading = false;
  private hasMore = false;
  private offset  = 0;

  oninit(vnode: any) { this.posts = []; this.loading = false; this.hasMore = false; this.offset = 0; super.oninit(vnode); }
  activeKey() { return 'posts'; }
  onUserLoaded(user: any) { this._user = user; this.loadPosts(true); }

  loadPosts(reset: boolean) {
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
    }).then((results: any) => {
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
        {this.posts.map((p: any) => PostCard({ post: p, context: this })).filter(Boolean)}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No posts yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}

// ─── Discussions page ─────────────────────────────────────────────────────────

export class AvocadoUserDiscussionsPage extends AvocadoUserBase {
  private discussions: any[] = [];
  private loading = false;
  private hasMore = false;
  private offset  = 0;
  private likingIds = new Set<string>();

  oninit(vnode: any) { this.discussions = []; this.loading = false; this.hasMore = false; this.offset = 0; this.likingIds = new Set(); super.oninit(vnode); }
  activeKey() { return 'discussions'; }
  onUserLoaded(user: any) { this._user = user; this.loadDiscussions(true); }

  loadDiscussions(reset: boolean) {
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
    }).then((results: any) => {
      const items       = Array.isArray(results) ? results : [];
      this.discussions  = reset ? [...items] : [...this.discussions, ...items];
      this.hasMore      = !!(results.payload?.links?.next);
      this.offset      += items.length;
      this.loading      = false;
      m.redraw();
    }).catch(() => { this.loading = false; m.redraw(); });
  }

  toggleLike(discussion: any) {
    const firstPost = discussion.firstPost?.();
    if (!firstPost) return;
    const id = discussion.id?.() as string;
    if (this.likingIds.has(id)) return;
    const isLiked = app.session.user && (firstPost.likes?.() || []).some((u: any) => u === app.session.user);
    this.likingIds.add(id);
    m.redraw();
    firstPost.save({ isLiked: !isLiked })
      .then(() => { this.likingIds.delete(id); m.redraw(); })
      .catch(() => { this.likingIds.delete(id); m.redraw(); });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.discussions.map((d: any) => (
          <ThreadCard
            key={d.id?.()}
            discussion={d}
            context={this}
            likingIds={this.likingIds}
            onToggleLike={(disc: any) => this.toggleLike(disc)}
          />
        ))}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.discussions.length === 0 && renderEmpty('No discussions yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadDiscussions(false))}
      </div>
    );
  }
}

// ─── Likes page ───────────────────────────────────────────────────────────────

export class AvocadoUserLikesPage extends AvocadoUserBase {
  private posts: any[]  = [];
  private loading = false;
  private hasMore = false;
  private offset  = 0;

  oninit(vnode: any) { this.posts = []; this.loading = false; this.hasMore = false; this.offset = 0; super.oninit(vnode); }
  activeKey() { return 'likes'; }
  onUserLoaded(user: any) { this._user = user; this.loadPosts(true); }

  loadPosts(reset: boolean) {
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
    }).then((results: any) => {
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
        {this.posts.map((p: any) => PostCard({ post: p, context: this })).filter(Boolean)}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No liked posts yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}

// ─── Mentions page ────────────────────────────────────────────────────────────

export class AvocadoUserMentionsPage extends AvocadoUserBase {
  private posts: any[]  = [];
  private loading = false;
  private hasMore = false;
  private offset  = 0;

  oninit(vnode: any) { this.posts = []; this.loading = false; this.hasMore = false; this.offset = 0; super.oninit(vnode); }
  activeKey() { return 'mentions'; }
  onUserLoaded(user: any) { this._user = user; this.loadPosts(true); }

  loadPosts(reset: boolean) {
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
    }).then((results: any) => {
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
        {this.posts.map((p: any) => PostCard({ post: p, context: this })).filter(Boolean)}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No mentions yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}
