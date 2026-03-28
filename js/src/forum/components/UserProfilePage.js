import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
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
  safeRoute,
  displayName,
  hexToRgba,
  tagPillStyle,
  FALLBACK_COLORS,
  discussionRoute,
  tagRoute,
  formatTimeLabel,
  truncate,
  postPreview as postExcerpt,
} from '../utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const findBySlug = (slug) => {
  const l = slug.toLowerCase();
  return app.store.all('users').find(
    (u) => (u.slug?.() || '').toLowerCase() === l || (u.username?.() || '').toLowerCase() === l
  ) || null;
};

const tabHref = (route, user) => {
  if (route === 'settings') return safeRoute('settings');
  return safeRoute(route, { username: user.slug?.() || user.username?.() });
};

const routeExists = (name) => !!app.routes[name];

const userRoute = (user) => {
  if (!user) return '#';
  try { return app.route('user', { username: user.username?.() || '' }); } catch (e) { return '#'; }
};

const PAGE_SIZE = 20;

// ─── Thread card (same visual as AllDiscussionsPage) ──────────────────────────

function renderThreadCard(discussion, likingIds, toggleLike, navigate) {
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
    const preview   = rawText ? rawText.slice(0, 100) + (rawText.length > 100 ? '…' : '') : '';
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

function renderPostCard(post, navigate) {
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function renderSkeleton() {
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

function renderLoadMore(label, onclick) {
  return (
    <div className="AvocadoDiscussions-loadMore">
      <button className="AvocadoDiscussions-loadMoreBtn" onclick={onclick}>{label}</button>
    </div>
  );
}

function renderEmpty(label) {
  return <div className="AvocadoDiscussions-empty">{label}</div>;
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
      </div>
    </div>
  );
}

// ─── Shared: sidebar nav ──────────────────────────────────────────────────────

// ─── Shared: sticky horizontal nav tabs (replaces sidebar) ───────────────────

export function buildSidebar(user, activeKey) {
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

  const isActor = app.session.user === user;
  const isMod   = app.forum.attribute('canModerateAccessTokens');
  const commentCount    = user.commentCount?.();
  const discussionCount = user.discussionCount?.();

  const mainTabs = [
    { key: 'posts',       label: 'Posts',       route: 'user',             icon: 'far fa-comment',  count: commentCount    },
    { key: 'discussions', label: 'Discussions',  route: 'user.discussions', icon: 'far fa-comments', count: discussionCount },
  ];
  if (routeExists('user.likes'))    mainTabs.push({ key: 'likes',    label: 'Likes',    route: 'user.likes',    icon: 'far fa-thumbs-up' });
  if (routeExists('user.mentions')) mainTabs.push({ key: 'mentions', label: 'Mentions', route: 'user.mentions', icon: 'fas fa-at'         });

  const settingsTabs = [];
  if (isActor || isMod) settingsTabs.push({ key: 'security', label: 'Security', route: 'user.security', icon: 'fas fa-shield-halved' });
  if (isActor)          settingsTabs.push({ key: 'settings', label: 'Settings', route: 'settings',      icon: 'fas fa-gear'          });

  const renderTab = ({ key, label, route, icon, count }) => {
    const href = tabHref(route, user);
    if (!href) return null;
    return (
      <a key={key}
         className={`AvocadoUserPage-navItem${key === activeKey ? ' is-active' : ''}`}
         href={href}
         onclick={(e) => { e.preventDefault(); m.route.set(href); }}>
        <i className={icon} aria-hidden="true" />
        <span>{label}</span>
        {count != null && <span className="AvocadoUserPage-navCount">{count}</span>}
      </a>
    );
  };

  return (
    <div className="AvocadoUserPage-nav">
      <div className="AvocadoUserPage-navInner">
        {mainTabs.map(renderTab)}
        {settingsTabs.length > 0 && (
          <>
            <div className="AvocadoUserPage-navDivider" />
            {settingsTabs.map(renderTab)}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Profile mobile nav (phone header SelectDropdown with profile tabs) ───────
// Mirrors native Flarum UserPage.sidebarItems() / navItems() for our custom layout.

export function buildUserPhoneNav(user, activeKey) {
  if (!user) return null;

  const isActor = app.session.user === user;
  const isMod   = app.forum.attribute('canModerateAccessTokens');
  const commentCount    = user.commentCount?.();
  const discussionCount = user.discussionCount?.();

  const tabs = [
    { key: 'posts',       label: 'Posts',       route: 'user',             icon: 'far fa-comment',        count: commentCount    },
    { key: 'discussions', label: 'Discussions',  route: 'user.discussions', icon: 'far fa-comments',       count: discussionCount },
  ];
  if (routeExists('user.likes'))    tabs.push({ key: 'likes',    label: 'Likes',    route: 'user.likes',    icon: 'far fa-thumbs-up'    });
  if (routeExists('user.mentions')) tabs.push({ key: 'mentions', label: 'Mentions', route: 'user.mentions', icon: 'fas fa-at'            });
  if ((isActor || isMod) && routeExists('user.security')) tabs.push({ key: 'security', label: 'Security', route: 'user.security', icon: 'fas fa-shield-halved' });
  if (isActor) tabs.push({ key: 'settings', label: 'Settings', route: 'settings', icon: 'fas fa-gear' });

  const links = tabs.map(({ key, label, route, icon, count }) => {
    const href = tabHref(route, user);
    if (!href) return null;
    // Let LinkButton auto-detect active state via route matching (same as native Flarum)
    return (
      <LinkButton key={key} href={href} icon={icon}>
        {count != null ? `${label} ${count}` : label}
      </LinkButton>
    );
  }).filter(Boolean);

  // Match native Flarum UserPage.sidebarItems() structure exactly:
  // SelectDropdown with className="App-titleControl" inside IndexPage-nav sideNav
  return (
    <nav className="IndexPage-nav sideNav">
      <ul>
        <li className="item item-nav">
          <SelectDropdown className="App-titleControl" buttonClassName="Button">
            {links}
          </SelectDropdown>
        </li>
      </ul>
    </nav>
  );
}

// ─── Base page ────────────────────────────────────────────────────────────────

class AvocadoUserBase extends Page {

  oninit(vnode) {
    super.oninit(vnode);
    this.user = null;
    this.userLoading = true;
    this.bodyClass = 'App--user';
    this.loadUser(m.route.param('username'));
  }

  loadUser(slug) {
    if (!slug) return;
    const cached = findBySlug(slug);
    if (cached?.joinTime?.()) {
      this.user = cached;
      this.userLoading = false;
      this.onUserLoaded(cached);
      return;
    }
    app.store.find('users', slug, { bySlug: true })
      .then((user) => {
        this.user = user;
        this.userLoading = false;
        this.onUserLoaded(user);
        m.redraw();
      })
      .catch(() => { this.userLoading = false; m.redraw(); });
  }

  onUserLoaded(user) {}

  navigate(event, href) { event.preventDefault(); m.route.set(href); }

  activeKey() { return 'posts'; }

  content() { return null; }

  view() {
    const user       = this.user;
    const isEditable = user && (user.canEdit?.() || user === app.session.user);
    const controls   = user ? UserControls.controls(user, this).toArray() : [];

    return (
      <div className="AvocadoUserPage">
        <div className="AvocadoNav-helper">{buildUserPhoneNav(user, this.activeKey())}</div>
        {buildHero(user, isEditable, controls)}
        {buildSidebar(user, this.activeKey())}
        <div className="AvocadoUserPage-body">
          <div className="AvocadoUserPage-bodyInner">
            {this.userLoading
              ? <div className="AvocadoHome-threadStack">{renderSkeleton()}</div>
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
        {this.posts.map((p) => renderPostCard(p, (e, h) => this.navigate(e, h)))}
        {this.loading && renderSkeleton()}
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
          renderThreadCard(d, this.likingIds, (d) => this.toggleLike(d), (e, h) => this.navigate(e, h))
        )}
        {this.loading && renderSkeleton()}
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
        {this.posts.map((p) => renderPostCard(p, (e, h) => this.navigate(e, h)))}
        {this.loading && renderSkeleton()}
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
        {this.posts.map((p) => renderPostCard(p, (e, h) => this.navigate(e, h)))}
        {this.loading && renderSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No mentions yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}
