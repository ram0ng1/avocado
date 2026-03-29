import { extend, override } from 'flarum/common/extend';
import Button from 'flarum/common/components/Button';
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

  // Detect UserOnline and mark Post-side via classList (safe — doesn't affect Mithril vdom children)
  side.classList.remove('Post-side--online');
  const userOnlineEl =
    root.querySelector('.PostUser-name .UserOnline') ||
    root.querySelector('.Post-header .UserOnline');
  if (userOnlineEl) side.classList.add('Post-side--online');

  // Badges: DO NOT move the Mithril-managed .PostUser-badges node (causes removeChild errors).
  // Instead, maintain a non-Mithril clone inside Post-side so badges appear near the avatar.
  const origBadges = root.querySelector('.PostUser-badges:not(.PostUser-badges--sideClone)');
  if (!origBadges) return;

  let clone = side.querySelector('.PostUser-badges--sideClone');
  if (!clone) {
    clone = origBadges.cloneNode(true);
    clone.classList.add('PostUser-badges--sideClone');
    clone.classList.remove('PostUser-badges--inPostHeader');
    side.appendChild(clone);
  } else {
    // Sync badge content on updates (subscription changes, etc.)
    clone.innerHTML = origBadges.innerHTML;
  }
  clone.querySelectorAll('.Badge').forEach((b) => b.removeAttribute('data-placement'));
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

      // Detect mobile-tab extension and add class if present
      if (app.extensions && app.extensions['android-com-pl/mobile-tab']) {
        document.documentElement.classList.add('has-mobile-tab');
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
              if (tightViewBox) out.setAttribute('viewBox', tightViewBox);

              // Compute explicit width so the SVG doesn't collapse in flex containers.
              // height is fixed at 35px; width = 35 * (viewBox-width / viewBox-height).
              const LOGO_H = 35;
              let logoW = LOGO_H; // fallback: square
              if (tightViewBox) {
                const vbParts = tightViewBox.split(' ');
                const vbW = parseFloat(vbParts[2]);
                const vbH = parseFloat(vbParts[3]);
                if (vbW > 0 && vbH > 0) logoW = Math.round(LOGO_H * vbW / vbH);
              }
              out.setAttribute('width', String(logoW));
              out.setAttribute('height', String(LOGO_H));
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
    // Avatar duplicate: CSS in DiscussionPage.less already hides .PostUser-name .Avatar
    // via display:none !important — no JS removal needed (avatar.remove() caused removeChild
    // errors because Mithril still tracked the removed nodes in its vdom).
    //
    // Badges: instead of moving Mithril-managed nodes (which causes removeChild errors on
    // redraw), we keep the original in place and maintain a non-Mithril clone in Post-side.
    extend(CommentPost.prototype, 'oncreate', function () {
      syncFixedAvatarBadges(this);
    });

    // FIX: guard before DOM ops — onupdate fires on every parent redraw.
    extend(CommentPost.prototype, 'onupdate', function () {
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

    // ── 25. Footer ────────────────────────────────────────────────────────────
    override(Footer.prototype, 'view', function () {
      return null;
    });

    // ── 26. MessagesPage: Avocado design integration ──────────────────────────
    // MessagesPage lives in a lazy webpack chunk (chunk 301 of flarum-messages).
    // At initializer time flarum.reg.get() returns undefined because the chunk
    // hasn't loaded yet.  We intercept flarum.reg.add() so the override is
    // applied the instant the chunk evaluates — whether that happens before or
    // after this initializer runs.

    // ── Inline reply component ───────────────────────────────────────────────
    // Replaces the ReplyPlaceholder+Composer combo with a real in-place textarea.
    class AvocadoInlineReply {
      oninit(vnode) {
        this.value   = '';
        this.sending = false;
      }
      view(vnode) {
        const { dialog, onSent } = vnode.attrs;
        const user = app.session.user;
        const disabled = this.sending || !this.value.trim();
        return (
          <div className="AvocadoMessages-inlineReply">
            {user && <Avatar user={user} />}
            <div className="AvocadoMessages-inlineReply-wrap">
              <textarea
                className="AvocadoMessages-inlineReply-input"
                placeholder={app.translator.trans('flarum-messages.forum.composer.placeholder')}
                value={this.value}
                rows="1"
                oninput={(e) => {
                  this.value = e.target.value;
                  // auto-grow
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._send(dialog, onSent);
                  }
                }}
              />
              <button
                className={'AvocadoMessages-inlineReply-send' + (disabled ? ' disabled' : '')}
                disabled={disabled}
                onclick={() => this._send(dialog, onSent)}
                title="Send"
              >
                <i className="fas fa-paper-plane" />
              </button>
            </div>
          </div>
        );
      }
      _send(dialog, onSent) {
        const text = this.value.trim();
        if (!text || this.sending) return;
        this.sending = true;
        m.redraw();
        // Use app.request directly to guarantee correct JSON:API relationship serialization.
        // Model.save({ dialog }) does not reliably serialize Model instances as relationships.
        app.request({
          method: 'POST',
          url: `${app.forum.attribute('apiUrl')}/dialog-messages`,
          body: {
            data: {
              type: 'dialog-messages',
              attributes: { content: text },
              relationships: {
                dialog: { data: { type: 'dialogs', id: String(dialog.id()) } },
              },
            },
          },
        }).then((response) => {
          try { app.store.pushPayload(response); } catch (_) {}
          this.value   = '';
          this.sending = false;
          if (typeof onSent === 'function') onSent(response);
          m.redraw();
        }).catch(() => {
          this.sending = false;
          m.redraw();
        });
      }
    }

    // ── MessageStream skeleton — replaces native LoadingIndicator ────────────
    const renderStreamSkeleton = () => (
      <div className="AvocadoMessages-skeleton-dialog" style="flex:1;padding-top:0">
        {[
          { out: false, w1: '55%', w2: '40%' },
          { out: true,  w1: '45%', w2: null   },
          { out: false, w1: '60%', w2: '35%' },
          { out: true,  w1: '50%', w2: '30%' },
          { out: false, w1: '40%', w2: null   },
          { out: true,  w1: '65%', w2: '20%' },
        ].map((row, i) => (
          <div key={i} className={'AvocadoMessages-skeleton-dialog-msg' + (row.out ? ' is-out' : '')}>
            {!row.out && <div className="AvocadoMessages-skeleton-avatar AvocadoMessages-skeleton-avatar--sm" />}
            <div className="AvocadoMessages-skeleton-dialog-bubble-wrap">
              <div className="AvocadoMessages-skeleton-dialog-bubble" style={`width:${row.w1}`} />
              {row.w2 && <div className="AvocadoMessages-skeleton-dialog-bubble" style={`width:${row.w2}`} />}
            </div>
            {row.out && <div className="AvocadoMessages-skeleton-avatar AvocadoMessages-skeleton-avatar--sm" />}
          </div>
        ))}
      </div>
    );

    // ── MessageStream override: skeleton + inline reply ───────────────────────
    // Tracks the currently-mounted MessageStream instance so we can re-bind
    // its realtime handler after the Pusher private channel becomes ready.
    // (flarum/messages binds MESSAGE_CREATED_EVENT in oncreate, but the channel
    // may not be set yet — this ensures the bind always happens.)
    let _currentStreamComponent = null;

    const applyMessageStreamOverride = (StreamClass) => {
      if (!StreamClass || StreamClass._avocadoStreamPatched) return;
      StreamClass._avocadoStreamPatched = true;

      // Track the mounted instance so bindChannels() can re-bind after ready
      extend(StreamClass.prototype, 'oninit', function () {
        _currentStreamComponent = this;
      });
      extend(StreamClass.prototype, 'onremove', function () {
        if (_currentStreamComponent === this) _currentStreamComponent = null;
      });

      // Override view() to replace native LoadingIndicator with skeleton
      override(StreamClass.prototype, 'view', function (original) {
        if (this.attrs.state?.isLoading?.()) {
          return <div className="MessageStream">{renderStreamSkeleton()}</div>;
        }
        return original();
      });

      extend(StreamClass.prototype, 'content', function (items) {
        // Replace the ReplyPlaceholder item (key='reply') with our inline box
        const idx = items.findIndex(i => i && i.key === 'reply');
        if (idx >= 0 && app.session.user?.canSendAnyMessage?.()) {
          const dialog = this.attrs.dialog;
          const scrollToBottom = () => { try { this.scrollToBottom(); } catch (_) {} };
          items[idx] = (
            <div className="MessageStream-item" key="reply">
              <AvocadoInlineReply
                dialog={dialog}
                onSent={(response) => {
                  const state  = this.attrs.state;
                  const dialog = this.attrs.dialog;
                  // Use state.push() to append the sent message without a full reload.
                  // Falls back to state.refresh() only if push is unavailable.
                  try {
                    const msgId  = response?.data?.id;
                    const msg    = msgId ? app.store.getById('dialog-messages', msgId) : null;
                    if (msg && state.hasItems() && typeof state.push === 'function') {
                      state.push(msg);
                      // Keep dialog.lastMessage in sync so sidebar shows latest message
                      if (dialog.data?.relationships?.lastMessage) {
                        dialog.data.relationships.lastMessage.data = { type: 'dialog-messages', id: msg.id() };
                      }
                      setTimeout(scrollToBottom, 60);
                      m.redraw();
                    } else {
                      state.refresh().then(() => {
                        setTimeout(scrollToBottom, 60);
                        m.redraw();
                      });
                    }
                  } catch (_) {
                    state.refresh().then(() => {
                      setTimeout(scrollToBottom, 60);
                      m.redraw();
                    });
                  }
                }}
              />
            </div>
          );
        }
        return items;
      });
    };

    const applyMessagesPageOverride = (MsgPage) => {
      if (!MsgPage || MsgPage._avocadoOverridden) return;
      MsgPage._avocadoOverridden = true;

      // Guard MessagesPage.onupdate — the extension reads this.element.querySelector(...)
      // which crashes when element is not yet set (e.g. during skeleton render).
      if (typeof MsgPage.prototype.onupdate === 'function') {
        const _origOnUpdate = MsgPage.prototype.onupdate;
        MsgPage.prototype.onupdate = function (vnode) {
          if (!this.element) return;
          try { _origOnUpdate.call(this, vnode); } catch (_) {}
        };
      }

      // Patch Message component: add Post--byCurrentUser when the message is
      // by the current user (the extension uses attrs.message, not attrs.post,
      // so Flarum core never adds this class automatically).
      const patchMessageClass = () => {
        try {
          const MessageClass = flarum.reg.get('flarum-messages', 'forum/components/Message');
          if (MessageClass && !MessageClass._avocadoPatched) {
            extend(MessageClass.prototype, 'classes', function (classes) {
              const msg = this.attrs.message;
              if (msg && app.session.user) {
                const msgUserId = msg.user?.()?.id?.() ?? msg.attribute?.('userId');
                const meId = app.session.user.id?.();
                if (msgUserId && meId && String(msgUserId) === String(meId)) {
                  if (!classes.includes('Post--byCurrentUser')) classes.push('Post--byCurrentUser');
                }
              }
              // Messenger-style grouping: add Post--grouped when previous message
              // is from the same user so we can hide the repeated avatar/name via CSS.
              const prevMsg = this.attrs.prevMessage;
              if (prevMsg && msg) {
                const thisSender = String(msg.user?.()?.id?.() ?? msg.attribute?.('userId') ?? '');
                const prevSender = String(prevMsg.user?.()?.id?.() ?? prevMsg.attribute?.('userId') ?? '');
                if (thisSender && prevSender && thisSender === prevSender) {
                  if (!classes.includes('Post--grouped')) classes.push('Post--grouped');
                }
              }
            });
            MessageClass._avocadoPatched = true;
          }
          const StreamClass = flarum.reg.get('flarum-messages', 'forum/components/MessageStream');
          applyMessageStreamOverride(StreamClass);

        } catch (_) {}
      };

      // Module-level flag so it survives component remounts
      let _msgPageFullyLoaded = false;

      // ── Mobile: don't auto-select first dialog (let user pick) ────────────
      const _origInitDialog = MsgPage.prototype.initDialog;
      MsgPage.prototype.initDialog = async function () {
        const isMobile = window.innerWidth < 768;
        if (isMobile && !m.route.param('id')) {
          const title = app.translator.trans('flarum-messages.forum.messages_page.title', {}, true);
          this.selectedDialog(null);
          this.currentDialogId = null;
          app.setTitle(title);
          m.redraw();
          return;
        }
        try {
          await _origInitDialog.call(this);
          // If the dialog was found in store but users weren't included
          // (e.g. fresh from MessageComposer POST), re-fetch with users.
          const dialog = this.selectedDialog?.();
          if (dialog && (!dialog.users() || dialog.users().length === 0)) {
            const fresh = await app.store.find('dialogs', dialog.id(), { include: 'users.groups' });
            if (fresh) {
              this.selectedDialog(fresh);
              m.redraw();
            }
          }
        } finally {
          _msgPageFullyLoaded = true;
          m.redraw();
        }
      };

      // ── Chat-switch skeleton (mimics discussion post skeleton) ──────────────
      const renderDialogSwitchSkeleton = () => (
        <div className="AvocadoMessages-skeleton-dialog">
          {/* Fake header */}
          <div className="AvocadoMessages-skeleton-dialog-header">
            <div className="AvocadoMessages-skeleton-avatar" />
            <div className="AvocadoMessages-skeleton-dialog-header-info">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--name" />
            </div>
          </div>
          {/* Fake messages */}
          {[
            { out: false, w1: '55%', w2: '40%' },
            { out: true,  w1: '45%', w2: null  },
            { out: false, w1: '60%', w2: '35%' },
            { out: true,  w1: '50%', w2: '30%' },
            { out: false, w1: '40%', w2: null  },
            { out: true,  w1: '65%', w2: '20%' },
          ].map((row, i) => (
            <div key={i} className={'AvocadoMessages-skeleton-dialog-msg' + (row.out ? ' is-out' : '')}>
              {!row.out && <div className="AvocadoMessages-skeleton-avatar AvocadoMessages-skeleton-avatar--sm" />}
              <div className="AvocadoMessages-skeleton-dialog-bubble-wrap">
                <div className="AvocadoMessages-skeleton-dialog-bubble" style={`width:${row.w1}`} />
                {row.w2 && <div className="AvocadoMessages-skeleton-dialog-bubble" style={`width:${row.w2}`} />}
              </div>
              {row.out && <div className="AvocadoMessages-skeleton-avatar AvocadoMessages-skeleton-avatar--sm" />}
            </div>
          ))}
        </div>
      );

      // ── Skeleton helpers ────────────────────────────────────────────────────
      const renderMsgListSkeleton = () => (
        <div className="AvocadoMessages-skeleton-list">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="AvocadoMessages-skeleton-item">
              <div className="AvocadoMessages-skeleton-avatar" />
              <div className="AvocadoMessages-skeleton-body">
                <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--name" />
                <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--msg" />
              </div>
            </div>
          ))}
        </div>
      );

      const renderMsgChatSkeleton = () => (
        <div className="AvocadoMessages-skeleton-chat">
          {/* Received bubbles */}
          <div className="AvocadoMessages-skeleton-bubble AvocadoMessages-skeleton-bubble--in">
            <div className="AvocadoMessages-skeleton-avatar" />
            <div className="AvocadoMessages-skeleton-bubble-body">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--name" />
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-lg" />
            </div>
          </div>
          <div className="AvocadoMessages-skeleton-bubble AvocadoMessages-skeleton-bubble--out">
            <div className="AvocadoMessages-skeleton-bubble-body">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-md" />
            </div>
            <div className="AvocadoMessages-skeleton-avatar" />
          </div>
          <div className="AvocadoMessages-skeleton-bubble AvocadoMessages-skeleton-bubble--in">
            <div className="AvocadoMessages-skeleton-avatar" />
            <div className="AvocadoMessages-skeleton-bubble-body">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-sm" />
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-lg" />
            </div>
          </div>
          <div className="AvocadoMessages-skeleton-bubble AvocadoMessages-skeleton-bubble--out">
            <div className="AvocadoMessages-skeleton-bubble-body">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-sm" />
            </div>
            <div className="AvocadoMessages-skeleton-avatar" />
          </div>
        </div>
      );

      // ── Compose button in toolbar actionItems ────────────────────────────────
      extend(MsgPage.prototype, 'actionItems', function (items) {
        if (!app.session.user?.canSendAnyMessage?.()) return;
        items.add('newMessage',
          <button
            type="button"
            className="Button Button--icon AvocadoMessages-composeBtn"
            title={app.translator.trans('flarum-messages.forum.messages_page.send_message_button')}
            onclick={() => {
              const SidebarClass = flarum.reg.get('flarum-messages', 'forum/components/MessagesSidebar');
              if (SidebarClass?.prototype?.newMessageAction) {
                SidebarClass.prototype.newMessageAction.call({});
                return;
              }
              document.querySelector('.MessagesPage-newMessage')?.click();
            }}
          >
            <i className="icon fas fa-edit Button-icon" aria-hidden="true" />
            <span className="Button-label" aria-hidden="true" />
          </button>,
          30
        );
      });

      override(MsgPage.prototype, 'view', function (original) {
        patchMessageClass();
        if (!v2Enabled) return original();

        // Show full skeleton only on very first load (before any dialog has been fetched)
        const isLoading = app.dialogs.isLoading() && !_msgPageFullyLoaded;

        // Show switch skeleton whenever the URL dialog ID doesn't match the
        // currently loaded dialog — purely synchronous, no async flag needed.
        const routeId    = String(m.route.param('id') ?? '');
        const loadedId   = String(this.selectedDialog?.()?.id?.() ?? '');
        const isSwitching = !isLoading && !!routeId && routeId !== loadedId;

        const hasDialog = (!!this.selectedDialog?.() || isSwitching) && !isLoading;
        const cardClass      = 'AvocadoMessages-card' + (hasDialog ? ' AvocadoMessages-card--onDialog' : '');

        const items = this.contentItems();
        const sidebarVnode = items.get('sidebar');
        const dialogVnode  = items.get('dialog');
        
        // FORCE re-create of dialog component with a unique key tied to dialog ID
        // This ensures MessageStream.oncreate() is called when dialog changes
        const dialogId = this.selectedDialog?.()?.id?.();
        const forceRecreatKey = isLoading ? 'loading' : (isSwitching ? 'switching' : (`dialog-${dialogId}`));
        
        // Apply key to force Mithril to destroy and recreate the component
        if (dialogVnode && !isLoading && !isSwitching) {
          dialogVnode.key = forceRecreatKey;
        }

        const self = this;
        const handleBackClick = (e) => {
          if (e.target.closest('.DialogSection-back')) {
            e.preventDefault();
            e.stopPropagation();
            self.selectedDialog(null);
            self.currentDialogId = null;
            const title = app.translator.trans('flarum-messages.forum.messages_page.title', {}, true);
            app.setTitle(title);
            // Navigate to base messages route so the URL no longer has an id
            // and initDialog won't re-load the previous conversation.
            try {
              m.route.set(app.route('messages'));
            } catch (_) {
              m.route.set('/messages');
            }
          }
        };

        return (
          <div className="AvocadoMessages MessagesPage">
            <div className="AvocadoNav-helper"><IndexSidebar key={m.route.get()} /></div>
            <div className={cardClass}>
              <div className="AvocadoMessages-listCol">
                {isLoading ? renderMsgListSkeleton() : sidebarVnode}
              </div>
              <div className="AvocadoMessages-chatCol" onclick={handleBackClick}>
                {isLoading
                  ? renderMsgChatSkeleton()
                  : isSwitching
                    ? renderDialogSwitchSkeleton()
                    : dialogVnode}
              </div>
            </div>
          </div>
        );
      });

      // ── Guard and verify realtime listeners are active (fallback) ────────────
      // If for some reason oncreate is not called, this ensures channels exist
      extend(MsgPage.prototype, 'onupdate', function (vnode) {
        if (!app.websocket || !app.session.user) return;
        if (!app.websocket_channels) app.websocket_channels = {};
        if (!app.websocket_channels.user) {
          try {
            console.log('[Avocado] Fallback: Creating user channel subscription');
            app.websocket_channels.user = app.websocket.subscribe(`private-user=${app.session.user.id()}`);
          } catch (err) {
            console.warn('[Avocado] Failed to subscribe to user channel:', err);
          }
        }
      });
    };

    // Case A: chunk already loaded (e.g. SSR or eager bundle)
    const MsgPageSync = flarum.reg.get('flarum-messages', 'forum/components/MessagesPage');
    if (MsgPageSync) {
      applyMessagesPageOverride(MsgPageSync);
    } else {
      // Case B: lazy chunk — intercept flarum.reg.add() to catch the moment
      // the chunk evaluates and registers the component.
      const _origRegAdd = flarum.reg.add.bind(flarum.reg);
      flarum.reg.add = function (extId, compName, comp) {
        _origRegAdd(extId, compName, comp);
        if (extId === 'flarum-messages' && compName === 'forum/components/MessagesPage') {
          applyMessagesPageOverride(comp);
          // Restore original so we don't intercept unrelated calls forever
          flarum.reg.add = _origRegAdd;
        }
      };
    }

    // ── 25. Notification polling (fallback — only when no WebSocket is live) ────
    // flarum/realtime sets app.websocket (Pusher) whose connection.state = 'connected'.
    (() => {
      const INTERVAL_MS = 30_000;

      const isWebSocketActive = () => {
        try {
          // flarum/realtime: app.websocket is the Pusher instance
          return app.websocket?.connection?.state === 'connected'
              || !!(window.Echo);
        } catch (_) { return false; }
      };

      const poll = () => {
        if (document.hidden) return;
        if (!app.session?.user) return;
        if (isWebSocketActive()) return;

        const userId = app.session.user.id?.();
        if (!userId) return;

        app.request({
          method: 'GET',
          url: `${app.forum.attribute('apiUrl')}/users/${userId}`,
          errorHandler: () => {},
        }).then(payload => {
          app.store.pushPayload(payload);
          m.redraw();
        }).catch(() => {});

        if (typeof app.dialogs?.load === 'function') {
          try { app.dialogs.load(); } catch (_) {}
        }
      };

      setTimeout(() => { poll(); setInterval(poll, INTERVAL_MS); }, 5000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    })();

    // ── 25b. flarum/realtime — custom event handlers ──────────────────────────
    // Strategy: subscribe directly via app.websocket (Pusher instance) rather
    // than going through RealtimeState callbacks.
    //
    // Why: RealtimeState.notifyPublicChannelReady is only called for guests;
    // logged-in users only get notifyUserChannelReady. Subscribing directly
    // avoids that asymmetry and works even if flarum/realtime's own boot
    // sequence hasn't fired yet.
    //
    // Channels:
    //   public            — public broadcasts (guests + fallback)
    //   private-user={id} — per-user personalised payload (logged-in users)
    //
    // Events bound on both channels (SendTriggerJob dispatches to both):
    //   likesMutation, discussionPinned
    // Events bound on user channel only (SendDialogMessageJob → private only):
    //   Flarum\Messages\DialogMessage\Event\Created/Updated
    (() => {
      const EV_MSG_CREATED = 'Flarum\\Messages\\DialogMessage\\Event\\Created';
      const EV_MSG_UPDATED = 'Flarum\\Messages\\DialogMessage\\Event\\Updated';

      const onPayload = (data) => {
        try { if (data) app.store.pushPayload(data); } catch (_) {}
        m.redraw();
      };

      const onDialog = (data) => {
        // Push the payload so the store is up-to-date.
        // flarum/messages' own extendRealtime already calls state.push(message)
        // and app.dialogs.refresh() — we must NOT call load/refresh again here
        // or the stream will do a full reload (the "freeze" the user sees).
        try { if (data) app.store.pushPayload(data); } catch (_) {}
        m.redraw();
      };

      const bindChannels = () => {
        try {
          if (!app.websocket) return false;

          // Public channel — for guests and as fallback for logged-in users.
          const pub = app.websocket.subscribe('public');
          if (!pub._avBound) {
            pub._avBound = true;
            pub.bind('likesMutation',    onPayload);
            pub.bind('discussionPinned', onPayload);
          }

          // Private user channel — personalised payload for logged-in users.
          if (app.session?.user) {
            const priv = app.websocket.subscribe(`private-user=${app.session.user.id()}`);
            if (!priv._avBound) {
              priv._avBound = true;
              priv.bind('likesMutation',    onPayload);
              priv.bind('discussionPinned', onPayload);
              priv.bind(EV_MSG_CREATED, onDialog);
              priv.bind(EV_MSG_UPDATED, onDialog);
            }
            // Re-bind flarum/messages' MessageStream handler now that the channel
            // is confirmed ready. MessageStream.oncreate binds via optional chaining
            // (app.websocket_channels?.user?.bind) — if the channel wasn't ready at
            // mount time the bind silently did nothing. We fix that here.
            try {
              const comp = _currentStreamComponent;
              if (comp && typeof comp.messageCreatedHandler === 'function') {
                priv.unbind(EV_MSG_CREATED, comp.messageCreatedHandler);
                priv.bind(EV_MSG_CREATED, comp.messageCreatedHandler);
              }
            } catch (_) {}
          }

          // Also notify RealtimeState so other flarum/realtime consumers work.
          const rs = flarum.reg.get('flarum-realtime', 'forum/RealtimeState');
          if (rs && !rs._avocadoNotified) {
            rs._avocadoNotified = true;
            if (app.websocket_channels) {
              if (app.websocket_channels.public)
                rs.notifyPublicChannelReady?.(app.websocket_channels.public);
              if (app.websocket_channels.user)
                rs.notifyUserChannelReady?.(app.websocket_channels.user);
            }
          }

          return true;
        } catch (_) { return false; }
      };

      // Poll until app.websocket is initialised (set during Application.mount).
      const MAX = 15_000, TICK = 300;
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += TICK;
        if (bindChannels()) {
          clearInterval(timer);
        } else if (elapsed >= MAX) {
          clearInterval(timer);
        }
      }, TICK);
    })();

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
