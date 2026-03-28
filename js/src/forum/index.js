import { extend, override } from 'flarum/common/extend';
import Tooltip from 'flarum/common/components/Tooltip';
import LinkButton from 'flarum/common/components/LinkButton';
import Avatar from 'flarum/common/components/Avatar';
import DiscussionListItem from 'flarum/forum/components/DiscussionListItem';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import Search from 'flarum/forum/components/Search';
import HeaderSecondary from 'flarum/forum/components/HeaderSecondary';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import IndexPage from 'flarum/forum/components/IndexPage';
import CommentPost from 'flarum/forum/components/CommentPost';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import WelcomeHero from 'flarum/forum/components/WelcomeHero';
import TagsPage from 'ext:flarum/tags/forum/components/TagsPage';
import UserPage from 'flarum/forum/components/UserPage';
import UserControls from 'flarum/forum/utils/UserControls';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import DiscussionHero from 'flarum/forum/components/DiscussionHero';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import { tagPageView } from './components/TagsPage';
import AvocadoTagPage from './components/TagPage';
import HomePage from './components/HomePage';
import AllDiscussionsPage from './components/AllDiscussionsPage';
import AvocadoDiscussionsSearchPage from './components/AvocadoDiscussionsSearchPage';
import AvocadoPostsSearchPage from './components/AvocadoPostsSearchPage';
import AvocadoSearchPage from './components/AvocadoSearchPage';
import {
  AvocadoUserPostsPage,
  AvocadoUserDiscussionsPage,
  AvocadoUserLikesPage,
  AvocadoUserMentionsPage,
  buildHero,
  buildSidebar,
  buildUserPhoneNav,
} from './components/UserProfilePage';
import AvocadoDiscussionStats from './components/AvocadoDiscussionStats';
import Footer from 'flarum/forum/components/Footer';
import MessagesPage from 'ext:flarum/messages/forum/components/MessagesPage';
// FIX: utils centralises helpers that were duplicated in every component file
import {
  trans,
  hexToRgba,
  iconColors,
  tagPillStyle,
  resolveAssetUrl,
  copyTextToClipboard,
} from './utils';
import { truncate } from 'flarum/common/utils/string';
import TextEditor from 'flarum/common/components/TextEditor';

// ─── Settings helpers ─────────────────────────────────────────────────────────

// PHP side uses boolval in serializeToForum, so values arrive as true/false/null.
const settingEnabled = (key, defaultValue = true) => {
  const val = app.forum?.attribute(key);
  if (val === null || val === undefined) return defaultValue;
  return !!val;
};

// Returns true when the URL has gambit filter params (e.g. filter[author]=ramon).
// Mithril parses filter[key]=value into an object for m.route.param('filter').
const hasFilterParams = () => {
  const filter = m.route.param('filter');
  return filter !== null && filter !== undefined &&
    typeof filter === 'object' && Object.keys(filter).length > 0;
};

const hasIndexFilters = () => {
  // 'sort' is intentionally excluded so /?sort=latest still shows the custom home.
  // 'filter' IS included: gambit-only searches (no text q) still show search results.
  if (hasFilterParams()) return true;
  return ['q', 'tags', 'page'].some((name) => {
    const value = m.route.param(name);
    return value !== null && value !== undefined && String(value).length > 0;
  });
};

const hasSearchQuery = () => {
  const q = m.route.param('q');
  if (q !== null && q !== undefined && String(q).length > 0) return true;
  // Gambit-only search: no text query but filter params present (e.g. author:ramon)
  return hasFilterParams();
};

// customHomeEnabled: V2 homepage is active whenever V2 itself is on (and no filters active).
// avocado.home_enabled no longer exists as a separate setting — it's unified with v2_enabled.
const customHomeEnabled = () =>
  settingEnabled('avocadoV2Enabled', true) && !hasIndexFilters();

const setClassName = (vdom, className, enabled) => {
  if (!vdom?.attrs) return;
  const current = typeof vdom.attrs.className === 'string' ? vdom.attrs.className : '';
  const classes  = current.split(/\s+/).filter(Boolean);
  const hasClass = classes.includes(className);
  if (enabled && !hasClass) classes.push(className);
  if (!enabled && hasClass) {
    vdom.attrs.className = classes.filter((n) => n !== className).join(' ');
    return;
  }
  vdom.attrs.className = classes.join(' ');
};

// ─── Post permalink ────────────────────────────────────────────────────────────

const getPostPermalink = (post) => {
  const discussion = post?.discussion?.();
  if (!discussion) return window.location.href;
  const near     = typeof post.number === 'function' ? post.number() : undefined;
  const relative = app.route.discussion(discussion, near);
  return new URL(relative, window.location.origin).toString();
};

// ─── Fixed-avatar badge sync ──────────────────────────────────────────────────

const syncFixedAvatarBadges = (component) => {
  const root = component.element;
  if (!root) return;

  const side = root.querySelector('.Post-side');
  if (!side) return;

  // Detect UserOnline and mark Post-side (Flarum 2.0: UserOnline is inside PostUser-name > a)
  side.classList.remove('Post-side--online');
  const userOnlineEl =
    root.querySelector('.PostUser-name .UserOnline') ||
    root.querySelector('.Post-header .UserOnline');
  if (userOnlineEl) side.classList.add('Post-side--online');

  const badges = root.querySelector('.PostUser-badges');
  if (!badges) return;

  if (badges.parentElement !== side) side.appendChild(badges);
  badges.classList.remove('PostUser-badges--inPostHeader');
  badges.querySelectorAll('.Badge').forEach((b) => b.removeAttribute('data-placement'));
};

// FIX: removed queueSyncFixedAvatarBadges (had redundant RAF + unguarded setTimeout).
// syncFixedAvatarBadges is called directly; onupdate now has a DOM-presence guard.


app.initializers.add(
  'ramon-avocado',
  () => {
    // V2 is always active — there is no admin toggle.
    const v2Enabled = true;

    // ── 0. Register custom routes ─────────────────────────────────────────────
    // The /discussions page is always registered so direct links keep working.
    app.routes['avocado-discussions'] = { path: '/discussions', component: AllDiscussionsPage };
    // Replace Flarum's default PostsPage (/posts?q=) with our Avocado-styled version.
    app.routes['posts'] = { path: '/posts', component: AvocadoPostsSearchPage };
    // Unified search page — Discussions / Posts / Users tabs.
    app.routes['avocado-search'] = { path: '/search', component: AvocadoSearchPage };

    if (v2Enabled) {
      // Override the tags extension's individual tag route with our custom page.
      app.routes['tag'] = { path: '/t/:tags', component: AvocadoTagPage };
      // User profile pages — standalone Avocado components
      // 'user.posts' has the same path as 'user' and is processed after it by mapRoutes,
      // so it overwrites 'user' in the mithril route map. Override both to ensure our
      // component wins for /u/:username.
      app.routes['user']             = { path: '/u/:username',             component: AvocadoUserPostsPage        };
      app.routes['user.posts']       = { path: '/u/:username',             component: AvocadoUserPostsPage        };
      app.routes['user.discussions'] = { path: '/u/:username/discussions', component: AvocadoUserDiscussionsPage  };
      app.routes['user.likes']       = { path: '/u/:username/likes',       component: AvocadoUserLikesPage        };
      app.routes['user.mentions']    = { path: '/u/:username/mentions',    component: AvocadoUserMentionsPage     };
    }

    // ── 1. Theme class + logo override (needs app.forum — use beforeMount) ──────
    // initialize() runs before store.pushPayload() and before app.forum is set.
    // app.beforeMount() callbacks run after app.forum is set, before Mithril mounts.
    app.beforeMount(() => {
      // Theme class on <html> — added whenever V2 is active
      if (v2Enabled) {
        document.documentElement.classList.add('avocado-theme');
      }

      // Custom SVG logo override.
      // PHP adds <style>#home-link{visibility:hidden}</style> to <head> so the
      // forum title never flashes. We fetch the SVG, find its content bounds via
      // getBBox, set a tight viewBox, then inline it so whitespace is cropped.
      if (settingEnabled('avocadoLogoEnabled', false)) {
        const logoSvgPath = app.forum.attribute('avocadoLogoSvg');
        const homeLink = document.getElementById('home-link');
        const logoUrl = logoSvgPath ? resolveAssetUrl(logoSvgPath) : null;

        const restoreVisibility = () => {
          if (homeLink) homeLink.style.visibility = '';
          const hide = document.getElementById('avocado-logo-hide');
          if (hide) hide.remove();
        };

        if (homeLink && logoUrl) {
          fetch(logoUrl)
            .then((r) => (r.ok ? r.text() : Promise.reject()))
            .then((svgText) => {
              const parser = new DOMParser();
              const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
              const svgEl = svgDoc.documentElement;
              if (svgEl.nodeName !== 'svg') throw new Error('not-svg');

              // Insert offscreen so getBBox works (requires DOM presence).
              const probe = document.createElement('div');
              probe.style.cssText =
                'position:fixed;top:-9999px;left:-9999px;width:2000px;height:2000px;overflow:hidden;';
              document.body.appendChild(probe);
              probe.appendChild(svgEl);

              let tightViewBox = null;
              try {
                let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                svgEl
                  .querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,text,image,use')
                  .forEach((el) => {
                    if (el.closest('defs')) return;
                    try {
                      const b = el.getBBox();
                      if (b.width > 0 && b.height > 0) {
                        x0 = Math.min(x0, b.x);
                        y0 = Math.min(y0, b.y);
                        x1 = Math.max(x1, b.x + b.width);
                        y1 = Math.max(y1, b.y + b.height);
                      }
                    } catch (_) {}
                  });
                if (isFinite(x0)) {
                  const pad = (x1 - x0) * 0.03; // 3% padding
                  tightViewBox = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
                }
              } catch (_) {}

              document.body.removeChild(probe);

              const out = svgEl.cloneNode(true);
              out.removeAttribute('width');
              out.removeAttribute('height');
              if (tightViewBox) out.setAttribute('viewBox', tightViewBox);
              out.setAttribute('class', 'Header-logo');
              out.setAttribute('role', 'img');
              out.setAttribute('aria-label', app.forum.attribute('title') || '');

              homeLink.textContent = '';
              homeLink.appendChild(out);
              restoreVisibility();
            })
            .catch(() => {
              // Fallback: plain <img> (no getBBox cropping)
              const img = document.createElement('img');
              img.src = logoUrl;
              img.alt = app.forum.attribute('title') || '';
              img.className = 'Header-logo';
              homeLink.textContent = '';
              homeLink.appendChild(img);
              restoreVisibility();
            });
        } else {
          restoreVisibility();
        }
      }
    });

    // ── 1b. Global Avatar override — person silhouette for users without a photo
    override(Avatar.prototype, 'view', function (original, vnode) {
      if (!v2Enabled || !settingEnabled('avocadoCustomDefaultAvatar', true)) return original(vnode);
      const user = this.attrs?.user;
      if (!user || user.avatarUrl?.()) return original(vnode);

      return (
        <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"
          className="Avatar AvocadoDefaultAvatar" aria-hidden="true">
          <circle cx="64" cy="64" r="64" className="AvocadoDefaultAvatar-bg" />
          <circle cx="64" cy="46" r="18" className="AvocadoDefaultAvatar-fg" />
          <path d="M64 70C42 70 24 82 24 96V128H104V96C104 82 86 70 64 70Z"
            className="AvocadoDefaultAvatar-fg" />
        </svg>
      );
    });

    // ── 2. UserPage (base for Security + Settings): Avocado layout ───────────
    // UserSecurityPage and SettingsPage are code-split chunks; override their
    // shared base (UserPage) which IS in the main bundle.
    override(UserPage.prototype, 'view', function (original, vnode) {
      if (!v2Enabled) return original(vnode);
      const user       = this.user;
      const isEditable = user && (user.canEdit?.() || user === app.session.user);
      const controls   = user ? UserControls.controls(user, this).toArray() : [];
      const route      = m.route.get?.() || '';
      const activeKey  = route === '/settings' ? 'settings'
                       : /\/security$/.test(route) ? 'security'
                       : 'posts';
      return (
        <div className="AvocadoUserPage">
          <div className="AvocadoNav-helper">{buildUserPhoneNav(user, activeKey)}</div>
          {buildHero(user, isEditable, controls)}
          {buildSidebar(user, activeKey)}
          <div className="AvocadoUserPage-body">
            <div className="AvocadoUserPage-bodyInner">
              {user ? this.content() : <LoadingIndicator />}
            </div>
          </div>
        </div>
      );
    });

    // ── 4. DiscussionHero: colored hero, white title, tag pills, state badges ────
    override(DiscussionHero.prototype, 'view', function (original, vnode) {
      if (!v2Enabled) return original(vnode);
      const discussion = this.attrs.discussion;
      if (!discussion) return original(vnode);

      const tags = (discussion.tags?.() || []).filter(Boolean);
      const firstTag = tags[0] || null;
      const tagColor = firstTag?.color?.() || null;
      const color = tagColor || 'var(--primary-color)';

      // WCAG relative-luminance text contrast for hero
      const heroTextColor = (() => {
        if (!tagColor || !tagColor.startsWith('#') || tagColor.replace('#', '').length !== 6) return '#ffffff';
        const hex = tagColor.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const toLinear = (c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
        return L > 0.35 ? '#202126' : '#ffffff';
      })();
      const heroTextMuted = heroTextColor === '#ffffff' ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.55)';
      const heroSurface   = heroTextColor === '#ffffff' ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.10)';

      const title = discussion.title?.() || '';
      const replyCount = discussion.replyCount?.() || 0;
      const postCount = replyCount + 1;

      // Avatars: author + lastPostedUser — O(1), avoids iterating the full store.
      const participantMap = new Map();
      const author = discussion.user?.();
      if (author?.id?.()) participantMap.set(author.id(), author);
      const lastPoster = discussion.lastPostedUser?.();
      if (lastPoster?.id?.() && !participantMap.has(lastPoster.id())) {
        participantMap.set(lastPoster.id(), lastPoster);
      }
      const participants = Array.from(participantMap.values());

      // Participant count: prefer the API attribute (serialized by Flarum core),
      // fall back to unique user IDs collected from loaded posts in the store.
      const apiCount = discussion.participantCount?.();
      const participantCount = (typeof apiCount === 'number' && apiCount > 0)
        ? apiCount
        : (() => {
            const ids = new Set();
            app.store.all('posts').forEach((p) => {
              if (p.discussion?.()?.id?.() === discussion.id?.()) {
                const uid = p.user?.()?.id?.();
                if (uid) ids.add(uid);
              }
            });
            return ids.size || participants.length;
          })();

      const MAX_PARTICIPANT_AVATARS = 6;
      const displayParticipants = participants.slice(0, MAX_PARTICIPANT_AVATARS);
      const extraParticipants = participants.length > MAX_PARTICIPANT_AVATARS
        ? participants.length - MAX_PARTICIPANT_AVATARS
        : 0;

      const renderParticipantAvatar = (user) => {
        if (!user) return null;
        const username = user.username?.();
        return (
          <span
            key={user.id?.()}
            className="DiscussionHero-participantAvatar"
            title={username}
          >
            <Avatar user={user} />
          </span>
        );
      };

      const isSticky = discussion.isSticky?.();
      const isLocked = discussion.isLocked?.();
      const isHidden = !!(discussion.hiddenAt?.());
      const subscription = discussion.subscription?.();

      return (
        <header className="DiscussionHero" style={{ '--discussion-color': color, '--disc-hero-text': heroTextColor, '--disc-hero-text-muted': heroTextMuted, '--disc-hero-surface': heroSurface }}>
          <div className="container">
            <div className="DiscussionHero-inner">
              {/* Nav row: back button + badges + tag pills */}
              <nav className="DiscussionHero-nav">
                <button
                  className="DiscussionHero-back"
                  onclick={() => {
                    if (window.history.length > 1) window.history.back();
                    else m.route.set(app.route('index'));
                  }}
                  aria-label="Back"
                >
                  <i className="fas fa-arrow-left" aria-hidden="true" />
                </button>

                <div className="DiscussionHero-pills">
                  {isSticky && (
                    <Tooltip text={trans('flarum-sticky.forum.badge.sticky_tooltip', 'Pinned')} position="bottom">
                      <span className="AvocadoHome-badge AvocadoHome-badge--sticky" role="img" aria-label={trans('flarum-sticky.forum.badge.sticky_tooltip', 'Pinned')}>
                        <i className="fas fa-thumbtack" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {isLocked && (
                    <Tooltip text={trans('flarum-lock.forum.badge.locked_tooltip', 'Locked')} position="bottom">
                      <span className="AvocadoHome-badge AvocadoHome-badge--locked" role="img" aria-label={trans('flarum-lock.forum.badge.locked_tooltip', 'Locked')}>
                        <i className="fas fa-lock" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {isHidden && (
                    <Tooltip text={trans('core.forum.post.hidden_text', 'Hidden')} position="bottom">
                      <span className="AvocadoHome-badge AvocadoHome-badge--hidden" role="img" aria-label={trans('core.forum.post.hidden_text', 'Hidden')}>
                        <i className="fas fa-eye-slash" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {subscription === 'follow' && (
                    <Tooltip text={trans('flarum-subscriptions.forum.badge.following_tooltip', 'Following')} position="bottom">
                      <span className="AvocadoHome-badge AvocadoHome-badge--following" role="img" aria-label={trans('flarum-subscriptions.forum.badge.following_tooltip', 'Following')}>
                        <i className="fas fa-star" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {subscription === 'ignore' && (
                    <Tooltip text={trans('flarum-subscriptions.forum.badge.ignoring_tooltip', 'Ignoring')} position="bottom">
                      <span className="AvocadoHome-badge AvocadoHome-badge--ignoring" role="img" aria-label={trans('flarum-subscriptions.forum.badge.ignoring_tooltip', 'Ignoring')}>
                        <i className="fas fa-eye-slash" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {tags.slice(0, 3).map((tag) => {
                    const tagColor = tag.color?.() || null;
                    const tagStyle = tagPillStyle(tagColor, 0.12);
                    return (
                      <a
                        key={tag.id()}
                        className="AvocadoHome-tagPill"
                        style={tagStyle}
                        href={app.route('tag', { tags: tag.slug() })}
                        onclick={(e) => { e.preventDefault(); m.route.set(app.route('tag', { tags: tag.slug() })); }}
                      >
                        {tag.icon() && <i className={tag.icon()} aria-hidden="true" />}
                        {tag.name()}
                      </a>
                    );
                  })}
                </div>
              </nav>

              {/* Title */}
              <h1 className="DiscussionHero-title">{title}</h1>

              {/* Meta: participants + post count */}
              <div className="DiscussionHero-meta">
                {participants.length > 0 && (
                  <div className="DiscussionHero-participants">
                    {displayParticipants.map(renderParticipantAvatar)}
                    {extraParticipants > 0 && (
                      <span className="DiscussionHero-participantsMore" title={`${participants.length} participants`}>
                        +{extraParticipants}
                      </span>
                    )}
                  </div>
                )}
                <span className="DiscussionHero-metaItem">
                  <i className="far fa-comment" aria-hidden="true" />
                  {postCount} {postCount === 1 ? 'post' : 'posts'}
                </span>
                {participantCount > 0 && (
                  <span className="DiscussionHero-metaItem">
                    <i className="fas fa-users" aria-hidden="true" />
                    {participantCount}{' '}
                    {participantCount === 1 ? 'participant' : 'participants'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>
      );
    });

    // ── 5. DiscussionPage skeleton override ───────────────────────────────────
    override(DiscussionPage.prototype, 'view', function (original, vnode) {
      if (!v2Enabled || this.discussion) return original(vnode);

      return (
        <div className="Page DiscussionPage DiscussionPage--skeleton">
          <div className="Page-main">
            <div className="AvocadoSkeleton-discussionHero">
              <div className="container">
                <div className="AvocadoSkeleton-nav">
                  <div className="AvocadoSkeleton-backBtn" />
                  <div className="AvocadoSkeleton-tag" />
                  <div className="AvocadoSkeleton-tag" style="width:56px" />
                </div>
                <div className="AvocadoSkeleton-title" />
                <div className="AvocadoSkeleton-meta">
                  <div className="AvocadoSkeleton-avatarStack">
                    <div className="AvocadoSkeleton-stackItem" />
                    <div className="AvocadoSkeleton-stackItem" />
                    <div className="AvocadoSkeleton-stackItem" />
                  </div>
                  <div className="AvocadoSkeleton-metaChip AvocadoSkeleton-metaChip--md" />
                  <div className="AvocadoSkeleton-metaChip AvocadoSkeleton-metaChip--sm" />
                </div>
              </div>
            </div>
            <div className="AvocadoSkeleton-stream container">
              {[0, 1, 2].map((i) => (
                <div key={String(i)} className="AvocadoSkeleton-post">
                  <div className="AvocadoSkeleton-postAvatar" />
                  <div className="AvocadoSkeleton-postBody">
                    <div className="AvocadoSkeleton-line AvocadoSkeleton-line--sm" />
                    <div className="AvocadoSkeleton-line AvocadoSkeleton-line--lg" />
                    <div className="AvocadoSkeleton-line AvocadoSkeleton-line--md" />
                    <div className="AvocadoSkeleton-line AvocadoSkeleton-line--sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    });

    // ── 6. Auth modal panel injection via Mithril content() override ─────────────
    // These modals are code-split chunks in Flarum 2.0 — static imports resolve to
    // undefined at load time. Dynamic imports are required. We kick off the Promise
    // at init so overrides are applied before the user can click "Log In".
    const authPanelOverride = (iconCls) => function authContent(original) {
      const rawUrl = app.forum?.attribute('avocadoAuthImage') || app.forum?.attribute('avocadoHeroImage') || null;
      const heroUrl = rawUrl ? resolveAssetUrl(rawUrl) : null;
      return (
        <>
          <div className="AvocadoAuth-formIcon">
            <i className={iconCls} aria-hidden="true" />
          </div>
          <div
            className="AvocadoAuth-panel"
            style={heroUrl ? { backgroundImage: `url(${heroUrl})`, backgroundSize: 'cover', backgroundPosition: 'center top' } : {}}
            oncreate={(vnode) => {
              // CSS :has() can lose to Flarum's inline max-width on .Modal-dialog.
              // Use setProperty('…', 'important') so our inline style beats everything,
              // including any Flarum JS-set inline style. Target both .Modal-dialog and
              // .Modal as fallback (structure varies between Flarum 2.x builds).
              if (window.innerWidth >= 768) {
                const targets = [
                  vnode.dom.closest?.('.Modal-dialog'),
                  vnode.dom.closest?.('.Modal'),
                ].filter(Boolean);
                targets.forEach((el) => {
                  el.style.setProperty('max-width', '860px', 'important');
                  el.style.setProperty('width',     '92vw',  'important');
                });
              }
            }}
          >
            <div className="AvocadoAuth-panelOverlay" />
          </div>
          {original()}
        </>
      );
    };

    // ExportRegistry.chunkUrl needs app.forum.attribute('assetsUrl') to build chunk
    // URLs. app.forum is set during boot() AFTER initializers run, so we must defer
    // the dynamic imports until the current synchronous boot stack is finished.
    // setTimeout(fn, 0) guarantees we run in the next event-loop tick — after boot().
    setTimeout(() => {
      if (!v2Enabled) return;
      Promise.all([
        import('flarum/forum/components/LogInModal'),
        import('flarum/forum/components/SignUpModal'),
        import('flarum/forum/components/ForgotPasswordModal'),
      ]).then(([{ default: LogInModal }, { default: SignUpModal }, { default: ForgotPasswordModal }]) => {
        if (LogInModal.prototype.__avocadoPanelPatched) return;
        override(LogInModal.prototype,         'content', authPanelOverride('fas fa-lock'));
        override(SignUpModal.prototype,         'content', authPanelOverride('fas fa-user-plus'));
        override(ForgotPasswordModal.prototype, 'content', authPanelOverride('fas fa-envelope'));
        LogInModal.prototype.__avocadoPanelPatched = true;
      }).catch(() => {}); // graceful no-op if chunks unavailable
    }, 0);

    // ── 7. HeaderSecondary auth buttons for guest users ───────────────────────
    extend(HeaderSecondary.prototype, 'items', function (items) {
      if (!v2Enabled || !settingEnabled('avocadoShowAuthButtons', false) || app.session.user) return;

      // Flarum 2.0 ItemList uses setContent() — replace() does not exist.
      // Keys: 'signUp' (capital U) and 'logIn'.
      if (items.has('signUp')) {
        items.setContent(
          'signUp',
          <button
            className="Button AvocadoHeader-authBtn AvocadoHeader-authBtn--signup"
            onclick={() => app.modal.show(() => import('flarum/forum/components/SignUpModal').then((m) => m.default))}
          >
            <i className="fas fa-user-plus" aria-hidden="true" />
            {app.translator.trans('core.forum.header.sign_up_link')}
          </button>
        );
      }

      if (items.has('logIn')) {
        items.setContent(
          'logIn',
          <button
            className="Button AvocadoHeader-authBtn AvocadoHeader-authBtn--login"
            onclick={() => app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default))}
          >
            <i className="fas fa-sign-in-alt" aria-hidden="true" />
            {app.translator.trans('core.forum.header.log_in_link')}
          </button>
        );
      }

      if (items.has('logIn') && items.has('signUp')) {
        items.add('avocadoAuthSep', <span className="AvocadoHeader-authSep">or</span>, 5);
      }
    });



    // ── 9. IndexPage contentItems: swap to HomePage or custom search ──────────
    extend(IndexPage.prototype, 'contentItems', function (items) {
      if (!v2Enabled) return;
      if (customHomeEnabled()) {
        items.remove('discussionList');
        items.remove('toolbar');
        items.add('avocadoHome', <HomePage />, 100);
      } else if (hasSearchQuery()) {
        // Redirect to the unified /search page instead of rendering inline.
        const params = app.search?.state?.params?.() || {};
        const searchRoute = app.route('avocado-search', params);
        setTimeout(() => m.route.set(searchRoute), 0);
        items.remove('discussionList');
        items.remove('toolbar');
      }
    });

    // ── 10. IndexPage view: setClassName for avocadoHome / avocadoSearch ──────
    extend(IndexPage.prototype, 'view', function (vdom) {
      if (!v2Enabled || !vdom) return;
      setClassName(vdom, 'IndexPage--avocadoHome', customHomeEnabled());
      setClassName(vdom, 'IndexPage--avocadoSearch', false);
    });

    // ── 12. IndexSidebar preload + items + navItems ────────────────────────────
    if (app.tagList?.load) {
      app.tagList.load(['children', 'parent']).catch(() => {});
    }

    extend(IndexSidebar.prototype, 'items', function (items) {
      const nav = items.get('nav');
      if (nav?.attrs) {
        nav.attrs.defaultLabel = app.translator.trans('core.forum.index.all_discussions_link');
        nav.attrs.lazyDraw = false;
      }
    });

    extend(IndexSidebar.prototype, 'navItems', function (items) {
      if (!v2Enabled) return;
      if (items.has('loading')) {
        items.remove('loading');
      }

      // Add "Popular discussions" as the first nav item — links to the custom homepage.
      if (!items.has('popularHome') && customHomeEnabled()) {
        items.add(
          'popularHome',
          <LinkButton href={app.route('index')} icon="fas fa-home">
            {trans('ramon-avocado.forum.home.popular_heading', 'Popular discussions')}
          </LinkButton>,
          110
        );
      }

      // Replace the default "All Discussions" link (→ index) with our custom page.
      if (items.has('allDiscussions')) {
        items.remove('allDiscussions');
        items.add(
          'allDiscussions',
          <LinkButton href={app.route('avocado-discussions')} icon="far fa-comments">
            {app.translator.trans('core.forum.index.all_discussions_link')}
          </LinkButton>,
          100
        );
      }

      // Add "Search" link — appears in the mobile nav drawer and drives the header title on /search.
      if (!items.has('avocadoSearch')) {
        items.add(
          'avocadoSearch',
          <LinkButton href={app.route('avocado-search')} icon="fas fa-search">
            Search
          </LinkButton>,
          95
        );
      }

    });

    // ── 13. WelcomeHero isHidden + view overrides ──────────────────────────────
    override(WelcomeHero.prototype, 'isHidden', function (original) {
      if (!v2Enabled) return original();
      if (customHomeEnabled()) return true;  // V2 home has its own banner
      if (hasSearchQuery()) return true;     // Search results have no hero
      if (app.forum?.attribute('avocadoHeroImage')) return false;
      return original();
    });

    override(WelcomeHero.prototype, 'view', function (original, vnode) {
      if (!v2Enabled) return original(vnode);
      const heroImage = app.forum?.attribute('avocadoHeroImage');

      if (!heroImage) return original(vnode);

      const heroUrl = resolveAssetUrl(heroImage);
      const pos = app.forum?.attribute('avocadoHeroImagePosition') || 'center top';

      const imgEl = (
        <img
          src={heroUrl}
          className="Hero--banner-img"
          fetchpriority="high"
          loading="eager"
          decoding="async"
          style={{ objectPosition: pos }}
          alt=""
          aria-hidden="true"
        />
      );

      const colorOverlay = <div className="Hero--banner-colorOverlay" aria-hidden="true" />;

      const result = original(vnode);

      if (result && result.attrs) {
        result.attrs.className = (result.attrs.className || '') + ' Hero--banner';
        const kids = Array.isArray(result.children)
          ? result.children
          : result.children != null ? [result.children] : [];
        result.children = [imgEl, colorOverlay, ...kids];
        return result;
      }

      return <header className="Hero WelcomeHero Hero--banner">{imgEl}{colorOverlay}</header>;
    });

    // ── 14. TagsPage: completely replace view ────────────────────────────────
    if (v2Enabled) {
      override(TagsPage.prototype, 'view', tagPageView);
    }

    // ── 14b. DiscussionsSearchSource: point "see all" link to /search ─────────
    // The default points to app.route('index', {q}) → /all?q=...
    // We redirect that to the unified /search page.
    import('flarum/forum/components/DiscussionsSearchSource').then(({ default: DiscussionsSearchSource }) => {
      extend(DiscussionsSearchSource.prototype, 'view', function (vnode, query) {
        if (!vnode || !Array.isArray(vnode)) return;
        // Walk the vnode tree to update any href pointing to /all
        const patchNode = (node) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(patchNode); return; }
          if (node.attrs?.href) {
            const href = node.attrs.href;
            if (typeof href === 'string' && href.includes('/all')) {
              const url = new URL(href, window.location.origin);
              url.pathname = app.route('avocado-search');
              node.attrs.href = url.pathname + url.search;
              if (node.attrs.onclick) {
                const q = url.searchParams.get('q') || '';
                node.attrs.onclick = (e) => { e.preventDefault(); m.route.set(app.route('avocado-search', { q })); };
              }
            }
          }
          if (Array.isArray(node.children)) node.children.forEach(patchNode);
        };
        patchNode(vnode);
      });
    }).catch(() => {});

    // ── 15. GlobalSearch view override (V1 search) ────────────────────────────
    override(GlobalSearch.prototype, 'view', function (original, ...args) {
      if (!settingEnabled('avocadoSearchV1')) return original.apply(this, args);
      return <Search state={this.searchState} />;
    });

    // ── 16. Search view extend (V1 search icons + truncate) ───────────────────
    extend(Search.prototype, 'view', function (vnode) {
      if (!settingEnabled('avocadoSearchV1')) return;
      if (!vnode || !Array.isArray(vnode.children)) return;

      const searchInput = vnode.children.find(
        (c) => c && c.attrs && typeof c.attrs.className === 'string' && c.attrs.className.includes('Search-input')
      );
      if (searchInput) {
        searchInput.attrs.className = 'Input Search-input Input--withPrefix Input--withClear';
        if (Array.isArray(searchInput.children)) {
          searchInput.children.unshift(<i aria-hidden="true" className="icon fas fa-search Input-prefix-icon" />);
        }
      }

      const walkAndTruncate = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walkAndTruncate); return; }

        if (node.attrs?.className?.includes('DiscussionSearchResult-excerpt') && Array.isArray(node.children)) {
          let remaining = 200;
          node.children = node.children.reduce((acc, child) => {
            if (remaining <= 0) return acc;
            if (typeof child === 'string') {
              if (child.length >= remaining) {
                acc.push(child.slice(0, remaining) + '…');
                remaining = 0;
              } else {
                acc.push(child);
                remaining -= child.length;
              }
            } else if (child && typeof child === 'object') {
              const text = typeof child.children?.[0] === 'string' ? child.children[0] : '';
              if (text.length >= remaining) {
                child.children = [text.slice(0, remaining) + '…'];
                acc.push(child);
                remaining = 0;
              } else {
                acc.push(child);
                remaining -= text.length;
              }
            }
            return acc;
          }, []);
          return;
        }

        if (Array.isArray(node.children)) node.children.forEach(walkAndTruncate);
      };

      walkAndTruncate(vnode);
    });

    // ── 17. DiscussionListItem elementAttrs (tag color + unread class) ─────────
    extend(DiscussionListItem.prototype, 'elementAttrs', function (attrs) {
      // FIX: call tags() once, not twice (was called once for the guard, once for the value)
      const firstTag = this.attrs.discussion.tags?.()?.[0];
      const color    = firstTag?.color?.();
      if (color) attrs.style = { '--tag-color': iconColors(color).color, ...(attrs.style || {}) };
      if (this.attrs.discussion.isUnread?.()) {
        attrs.className = `${attrs.className || ''} DiscussionListItem--unread`;
      }
    });

    // ── 18. CommentPost elementAttrs (fixedAvatar class) ──────────────────────
    extend(CommentPost.prototype, 'elementAttrs', function (attrs) {
      if (!settingEnabled('avocadoFixedAvatarEffect')) return;
      attrs.className = `${attrs.className || ''} CommentPost--fixedAvatar`;
    });

    // ── 19. CommentPost oncreate/onupdate (badges + duplicate avatar fix) ────────
    // The real avatar lives in Post-side. PostUser may render a second Avatar
    // inside Post-header (32px, different class in Flarum 2.0). We find any
    // .Avatar / .AvocadoDefaultAvatar inside Post-header and remove it along
    // with its enclosing <li> or <a> wrapper.
    // In Flarum 2.0, PostUser renders as:
    //   <div.PostUser> <h3.PostUser-name> <a> <Avatar/> <UserOnline/> <span.username> </a> </h3> <ul.PostUser-badges> </div>
    // The Avatar and username are BOTH inside the same <a> link.
    // We must remove ONLY the Avatar element — never the parent <a> — to keep the username.
    const removePostUserAvatar = (component) => {
      const postHeader = component.element?.querySelector('.Post-header');
      if (!postHeader) return;
      // Scope to .PostUser-name only — UserCard avatar lives in .Post-header too
      // and must NOT be removed.
      postHeader.querySelectorAll('.PostUser-name .Avatar, .PostUser-name .AvocadoDefaultAvatar').forEach((avatar) => {
        avatar.remove();
      });
    };

    extend(CommentPost.prototype, 'oncreate', function () {
      removePostUserAvatar(this);
      syncFixedAvatarBadges(this);
    });

    // FIX: guard before DOM ops — onupdate fires on every parent redraw.
    // Without the guard, 20 posts × 3 DOM queries = 60 ops per global m.redraw().
    extend(CommentPost.prototype, 'onupdate', function () {
      if (!this.element?.querySelector('.PostUser-name .Avatar, .PostUser-name .AvocadoDefaultAvatar')) return;
      removePostUserAvatar(this);
      syncFixedAvatarBadges(this);
    });

    // ── 20. CommentPost actionItems (share button) ────────────────────────────
    extend(CommentPost.prototype, 'actionItems', function (items) {
      if (!settingEnabled('avocadoShowShare')) return;
      const post = this.attrs.post;
      items.add(
        'avocado-share',
        <button
          className="Button Button--link avocado-action-btn avocado-share-btn"
          onclick={(e) => {
            const url = getPostPermalink(post);
            const el = e.currentTarget;
            if (navigator.share) {
              navigator.share({ title: post.discussion()?.title?.() || document.title, url }).catch(() => {});
            } else {
              copyTextToClipboard(url)
                .then(() => {
                  el.classList.add('avocado-share-done');
                  setTimeout(() => el.classList.remove('avocado-share-done'), 2000);
                })
                .catch(() => {});
            }
          }}
        >
          <span className="avocado-action-face">
            <i className="avocado-action-icon icon fas fa-share" aria-hidden="true" />
          </span>
          <span className="avocado-action-label">{trans('ramon-avocado.forum.actions.share', 'Share')}</span>
        </button>,
        -5
      );
    });

    // ── 21. DiscussionControls userControls (reply icon) ──────────────────────
    extend(DiscussionControls, 'userControls', function (items) {
      if (!items.has('reply')) return;
      const reply = items.get('reply');
      if (reply && reply.attrs) {
        reply.attrs.icon = 'fa-solid fa-reply';
      }
    });

    // ── 22. CommentPost actionItems (like/reply icons) ────────────────────────
    extend(CommentPost.prototype, 'actionItems', function (items) {
      if (!settingEnabled('avocadoShowActionIcons')) return;
      if (items.has('like')) {
        const post = this.attrs.post;
        const likes = post.likes?.();
        const isLiked = app.session.user && likes && likes.some((user) => user === app.session.user);
        const like = items.get('like');
        if (like && like.attrs) {
          like.attrs.icon = isLiked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up';
        }
      }
      if (items.has('reply')) {
        const reply = items.get('reply');
        if (reply && reply.attrs) {
          reply.attrs.icon = 'fa-solid fa-reply';
        }
      }
    });

    // ── 19b. CommentPost headerItems: OP badge on post #1 ────────────────────
    // headerItems() priorities: 'user'@100, 'meta'@0 — badge at 50 lands
    // between username and timestamp in the Post-header flex row.
    extend(CommentPost.prototype, 'headerItems', function (items) {
      if (!v2Enabled) return;
      const post = this.attrs?.post;
      if (post?.number?.() !== 1) return;
      items.add('avocado-op', <span className="AvocadoPost-opBadge">OP</span>, 50);
    });

    // ── 19c. DiscussionPage sidebarItems: stats card ──────────────────────────
    // 'controls'@100, 'scrubber'@-100 — stats at 0 sits between them.
    extend(DiscussionPage.prototype, 'sidebarItems', function (items) {
      if (!v2Enabled) return;
      const discussion = this.discussion;
      if (!discussion) return;
      items.add('avocado-stats', <AvocadoDiscussionStats discussion={discussion} />, 0);
    });

    // ── 23. TextEditor emoji dropdown: fix viewport positioning in AvocadoHome ─
    // The emoji extension computes caret coords relative to the textarea and
    // applies them as CSS top/left on a position:fixed element — so they land
    // near (0,0) of the viewport. We add a second input listener that runs
    // after the emoji extension's listener and re-positions using
    // getBoundingClientRect() to obtain true viewport coordinates.
    extend(TextEditor.prototype, 'buildEditorParams', function (params) {
      if (!v2Enabled) return;
      params.inputListeners.push(() => {
        if (!this.emojiDropdown?.active) return;
        const composerBody = this.element?.closest?.('.AvocadoHome-composerBody');
        if (!composerBody) return;

        const textarea = this.element?.querySelector?.('.TextEditor-editor');
        if (!textarea) return;

        const dropdownEl = this.emojiDropdown.$()[0];
        if (!dropdownEl) return;

        const textareaRect = textarea.getBoundingClientRect();
        const dropdownH = dropdownEl.offsetHeight || 280;
        const dropdownW = dropdownEl.offsetWidth || 300;

        const selection = this.attrs.composer.editor.getSelectionRange?.();
        if (!selection) return;
        const caret = this.attrs.composer.editor.getCaretCoordinates?.(selection[0]);
        if (!caret) return;

        // caret coords are relative to the textarea element; convert to viewport
        let vTop = textareaRect.top + caret.top + 15;
        let vLeft = textareaRect.left + caret.left;

        // Flip above cursor when not enough room below
        if (vTop + dropdownH > window.innerHeight - 8) {
          vTop = textareaRect.top + caret.top - dropdownH - 15;
        }

        // Clamp within viewport
        vTop = Math.max(4, Math.min(vTop, window.innerHeight - dropdownH - 4));
        vLeft = Math.max(4, Math.min(vLeft, window.innerWidth - dropdownW - 4));

        this.emojiDropdown.$().css({ top: vTop + 'px', left: vLeft + 'px' });
      });
    });

    // ── 24a. WebSocket: remove unlike notification from UI ────────────────────
    // When the current user's post is unliked, the DB notification is already
    // removed by flarum/likes. We listen on the private user channel to update
    // the store in real-time so the bell badge and notification list stay in sync.
    if (v2Enabled && app.pusher && typeof app.pusher.then === 'function') {
      app.pusher.then(({ channels }) => {
        if (!channels?.user || !app.session?.user) return;
        channels.user.bind('postUnliked', (data) => {
          const postId = String(data?.postId || '');
          if (!postId) return;

          // Try to find the notification in the local store.
          // It may NOT be there if the user never opened the bell in this session,
          // which happens when a like→unlike occurs very quickly.
          const notif = app.store.all('notifications').find((n) =>
            n.contentType?.() === 'postLiked' &&
            String(n.subject?.()?.id?.() || '') === postId
          );

          if (notif) {
            // Notification is in the store: remove it immediately
            const notifId = notif.id?.();
            if (notifId && app.store.data?.notifications) {
              delete app.store.data.notifications[notifId];
            }
          }

          // Clear the panel cache so it re-fetches from server on next open
          if (app.notifications?.clear) app.notifications.clear();

          // Re-fetch the current user from the server to get the accurate
          // unreadNotificationCount — avoids blindly touching counts for
          // unrelated notifications.
          const userId = app.session?.user?.id?.();
          if (userId) {
            app.store.find('users', userId)
              .then(() => m.redraw())
              .catch(() => m.redraw());
          } else {
            m.redraw();
          }
        });
      });
    }

    // ── 25. Footer ────────────────────────────────────────────────────────────
    override(Footer.prototype, 'view', function () {
      return null;
    });

    // ── 26. MessagesPage: Avocado design integration ──────────────────────────
    if (MessagesPage) {
      override(MessagesPage.prototype, 'view', function () {
        if (!v2Enabled) return this.__originalView ? this.__originalView() : <div />;

        // Build nav — same filter logic as renderNavBar() in HomePage
        let navEl = null;
        try {
          const itemList = IndexSidebar.prototype.navItems.call({});
          itemList.remove('tags');
          itemList.remove('popularHome');
          itemList.remove('allDiscussions');
          const navItems = itemList.toArray().filter((item) => {
            if (!item || typeof item.tag === 'string') return false;
            if (item.attrs && 'model' in item.attrs) return false;
            const href = item.attrs?.href || '';
            if (/\/t\//.test(href)) return false;
            return true;
          });
          if (navItems.length) {
            navEl = <nav className="AvocadoHomeNav" aria-label="Navigation">{navItems}</nav>;
          }
        } catch (_) {}

        // Pull the extension's own rendered pieces from contentItems()
        const items = this.contentItems();
        const sidebarVnode = items.get('sidebar');
        const dialogVnode  = items.get('dialog');

        return (
          <div className="AvocadoMessages MessagesPage">
            {/* IndexSidebar helper: App-titleControl escapes position:absolute to mobile header */}
            <div className="AvocadoNav-helper"><IndexSidebar /></div>
            <div className="AvocadoMessages-inner">
              <div className="AvocadoMessages-head">
                <h1 className="AvocadoMessages-title">{app.translator.trans('flarum-messages.forum.list.nav_link')}</h1>
              </div>
              {navEl}
              <div className="AvocadoMessages-card">
                <div className="AvocadoMessages-listCol">{sidebarVnode}</div>
                <div className="AvocadoMessages-chatCol">{dialogVnode}</div>
              </div>
            </div>
          </div>
        );
      });
    }

    // ── 24. DiscussionListItem infoItems (excerpt) ────────────────────────────
    extend(DiscussionListItem.prototype, 'infoItems', function (items) {
      if (!items.has('excerpt')) {
        const firstPost = this.attrs.discussion.firstPost?.();
        if (firstPost) {
          // FIX: null-guard on contentPlain() before passing to truncate
          const plain = firstPost.contentPlain?.() || '';
          if (plain) items.add('excerpt', <div>{truncate(plain, 175)}</div>, -100);
        }
      }
    });


  },
  -10
);
