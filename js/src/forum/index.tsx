// @ts-nocheck — bootstrap file: dozens of extend/override callbacks with
// implicit `any` parameters. Properly typing each would require pinning down
// every patched core component's shape. The page components this file wires
// together are individually type-checked.
import { extend, override } from 'flarum/common/extend';
import trustedHtml from '../common/trustedHtml';
import Button from 'flarum/common/components/Button';
import PostControls from 'flarum/forum/utils/PostControls';
import Tooltip from 'flarum/common/components/Tooltip';
import LinkButton from 'flarum/common/components/LinkButton';
import Avatar from 'flarum/common/components/Avatar';
import DiscussionListItem from 'flarum/forum/components/DiscussionListItem';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import Search from 'flarum/forum/components/Search';
import HeaderSecondary from 'flarum/forum/components/HeaderSecondary';
import HeaderDropdown from 'flarum/forum/components/HeaderDropdown';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import IndexPage from 'flarum/forum/components/IndexPage';
import CommentPost from 'flarum/forum/components/CommentPost';
import PostEdited from 'flarum/forum/components/PostEdited';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import WelcomeHero from 'flarum/forum/components/WelcomeHero';
import TagsPage from 'ext:flarum/tags/forum/components/TagsPage';
import sortTags from 'ext:flarum/tags/common/utils/sortTags';
import { applyColor, clearColor } from './colored';
import UserPage from 'flarum/forum/components/UserPage';
import UserControls from 'flarum/forum/utils/UserControls';
import DiscussionHero from 'flarum/forum/components/DiscussionHero';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import PageStructure from 'flarum/forum/components/PageStructure';
// PostStream is code-split (lazy-loaded by DiscussionPage).
// Do NOT import it statically — use the string-based extend/override so that
// flarum.reg.onLoad() applies the patch after the module is loaded.
import { tagPageView } from './components/TagsPage';
import HomePage from './components/HomePage';
import BookmarkModal from './components/BookmarkModal';
// A página "Salvos" entra no bundle principal em vez de virar chunk: com o
// fof/bookmarks ativo ela atende a rota dele, e o bundle dele usa ids numéricos
// de webpack no `webpackChunkmodule_exports` compartilhado — a colisão de ids
// entre runtimes que o webpack.config comenta ("s[t] is not a function") aparece
// justamente ao carregar chunk nessa rota. Sem chunk, sem colisão.
import AvocadoBookmarksPage from './components/BookmarksPage';
import BookmarkReminderNotification from './components/BookmarkReminderNotification';
import { buildUserPhoneNav, buildHero, buildSidebar } from './components/UserProfileBuilders';

// ─── Lazy route components ────────────────────────────────────────────────────
// Flarum's DefaultResolver.onmatch expects either:
//   a) component.prototype instanceof Component  → used directly as a class
//   b) an async function () → Promise<{ default: Comp }>  → called and .default used
// Pattern (b) is the "AsyncNewComponent" type in Flarum's typings.
// autoChunkNameLoader (flarum-webpack-config) automatically injects
// webpackChunkName comments so each import() becomes its own JS chunk
// registered with flarum.reg.addChunkModule().

// `webpackPrefetch: true` faz o webpack emitir `<link rel="prefetch">` para
// AllDiscussionsPage e TagPage (rotas mais prováveis após a home/tags). O
// browser baixa esses chunks em idle, sem bloquear o first paint. Search*
// e TeamPage ficam sem prefetch — só baixam quando o usuário navega.

const AllDiscussionsPage = () => import('./components/AllDiscussionsPage');
const AvocadoTagPage = () => import('./components/TagPage');
const AvocadoTeamPage = () => import('./components/TeamPage');
const AvocadoPostsSearchPage = () => import('./components/AvocadoPostsSearchPage');
const AvocadoSearchPage = () => import('./components/AvocadoSearchPage');

// UserProfilePage uses named exports — wrap each into { default: Comp } shape.
// All four share the same webpack chunk so the module is only fetched once.
const AvocadoUserPostsPage = () => import('./components/UserProfilePage').then((m) => ({ default: m.AvocadoUserPostsPage }));
const AvocadoUserDiscussionsPage = () => import('./components/UserProfilePage').then((m) => ({ default: m.AvocadoUserDiscussionsPage }));
const AvocadoUserLikesPage = () => import('./components/UserProfilePage').then((m) => ({ default: m.AvocadoUserLikesPage }));
const AvocadoUserMentionsPage = () => import('./components/UserProfilePage').then((m) => ({ default: m.AvocadoUserMentionsPage }));
import AvocadoDiscussionStats from './components/AvocadoDiscussionStats';
import Footer from 'flarum/forum/components/Footer';
// FIX: utils centralises helpers that were duplicated in every component file
import {
  trans,
  hexLuminance,
  iconColors,
  tagPillStyle,
  resolveAssetUrl,
  copyTextToClipboard,
  truncate,
  safeCssUrl,
  renderThreadSkeleton,
  renderDiscussionNavSkeleton,
  displayName,
  getDiscussionHeroImageUrl,
  tagsRequireHeroImage,
  uploadDiscussionHeroImage,
  deleteDiscussionHeroImage,
  canEditDiscussionHero,
  sanitizeAdminHtml,
} from './utils';
import {
  toggleBookmark,
  isBookmarked,
  avocadoBookmarksEnabled,
  usesFofBookmarks,
  fofPostButtonInMenu,
  fofTrans,
  BOOKMARKS_PATH,
} from './utils/bookmarks';
import { hoverCardAttrs } from './components/shared/UserHoverCard';
import WhoIsReading from './components/shared/WhoIsReading';
import CakedayBadge from './components/shared/CakedayBadge';
import TextEditor from 'flarum/common/components/TextEditor';
import listItems from 'flarum/common/helpers/listItems';
import humanTime from 'flarum/common/utils/humanTime';

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
  return filter !== null && filter !== undefined && typeof filter === 'object' && Object.keys(filter).length > 0;
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
const customHomeEnabled = () => settingEnabled('avocadoV2Enabled', true) && !hasIndexFilters();

const setClassName = (vdom, className, enabled) => {
  if (!vdom?.attrs) return;
  const current = typeof vdom.attrs.className === 'string' ? vdom.attrs.className : '';
  const classes = current.split(/\s+/).filter(Boolean);
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
  const near = typeof post.number === 'function' ? post.number() : undefined;
  const relative = app.route.discussion(discussion, near);
  return new URL(relative, window.location.origin).toString();
};

// ─── Code block copy button ───────────────────────────────────────────────────
const initCodeBlocks = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    // Only inject once
    if (pre.querySelector('.avocado-code-copy')) return;

    const makeIcon = (cls: string) => {
      const i = document.createElement('i');
      i.className = `fas ${cls}`;
      i.setAttribute('aria-hidden', 'true');
      return i;
    };
    const btn = document.createElement('button');
    btn.className = 'avocado-code-copy';
    btn.setAttribute('aria-label', 'Copiar código');
    btn.replaceChildren(makeIcon('fa-copy'));

    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      const text = code ? code.textContent || '' : pre.textContent || '';
      navigator.clipboard
        .writeText(text)
        .then(() => {
          btn.classList.add('avocado-code-copy--copied');
          btn.replaceChildren(makeIcon('fa-check'));
          setTimeout(() => {
            btn.classList.remove('avocado-code-copy--copied');
            btn.replaceChildren(makeIcon('fa-copy'));
          }, 1800);
        })
        .catch(() => {});
    });

    pre.appendChild(btn);
  });
};

// ─── Reaction count: inject "1" badge when extension omits it ────────────────
// fof/reactions only renders <span class="count"> when count > 1.
// For count=1 we parse the aria-label and inject the count manually.
const fixReactionCounts = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('.Button-emoji-parent').forEach((btn) => {
    if (btn.querySelector('.count')) return; // already has count
    const label = btn.getAttribute('aria-label') || '';
    const match = label.match(/\((\d+)/);
    if (!match) return;
    const count = parseInt(match[1], 10);
    const innerSpan = btn.querySelector<HTMLElement>('.Button-labelText > span');
    if (!innerSpan) return;
    const span = document.createElement('span');
    span.className = 'count';
    span.textContent = String(count);
    innerSpan.appendChild(span);
  });
};

// ─── Unreact button: replace generic SVG with the user's reacted emoji ───────
// When user has reacted, the extension renders an unreact button with the same
// smiley SVG as the react button. We replace it with the user's emoji from the
// active count badge (which lives in Post-footer, sibling of Post-actions inside
// the same Post-main).
const fixUnreactButton = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('.Reactions').forEach((wrapper) => {
    // Unreact state: .Reactions directly contains the button (no .Reactions--react wrapper)
    if (wrapper.querySelector('.Reactions--react')) return;
    const btn = wrapper.querySelector<HTMLElement>('.Reactions--ShowReactions');
    if (!btn || btn.dataset.emojiFixed) return;

    // Find the active reaction badge in Post-main (may be in adjacent Post-footer)
    const postMain = wrapper.closest<HTMLElement>('.Post-main');
    if (!postMain) return;
    const activeBadge = postMain.querySelector<HTMLElement>('.Button-emoji-parent.active');
    if (!activeBadge) return;

    // Clone the emoji element from the badge
    const emojiEl = activeBadge.querySelector<HTMLElement>('img.emoji, .emoji, .reaction-icon');
    if (!emojiEl) return;

    const svgEl = btn.querySelector<SVGElement>('svg.button-react');
    if (!svgEl) return;

    const emojiClone = emojiEl.cloneNode(true) as HTMLElement;
    // Ensure consistent sizing inside the button
    emojiClone.style.width = '18px';
    emojiClone.style.height = '18px';
    svgEl.replaceWith(emojiClone);
    btn.dataset.emojiFixed = '1';
    btn.classList.add('active');
  });
};

// ─── Fixed-avatar badge sync ──────────────────────────────────────────────────

const syncUserOnline = (component) => {
  const root = component.element;
  if (!root) return;
  const side = root.querySelector('.Post-side');
  if (!side) return;
  side.classList.remove('Post-side--online');
  const userOnlineEl = root.querySelector('.PostUser-name .UserOnline') || root.querySelector('.Post-header .UserOnline');
  if (userOnlineEl) side.classList.add('Post-side--online');
};

const isExternalLink = (link) => {
  try {
    const url = new URL(link.href, window.location.href);
    return url.hostname !== window.location.hostname;
  } catch (_) {
    return false;
  }
};

// A link is "raw" when its visible text is just the URL itself (or empty). In
// that case there's no descriptive context worth keeping, so the whole link is
// swapped for the placeholder — otherwise we'd preserve an ugly bare URL.
const isRawUrlLink = (link) => {
  const text = (link.textContent || '').trim();
  if (!text) return true;
  if (text === link.href) return true;
  if (/^https?:\/\//i.test(text)) return true;
  return false;
};

// Build the lock-icon pill shown in place of (or alongside) a gated link.
// data-avocado-gated prevents double-processing on onupdate redraws.
const buildGuestLinkPlaceholder = (label) => {
  const placeholder = document.createElement('span');
  placeholder.className = 'AvocadoGuestLink';
  placeholder.setAttribute('data-avocado-gated', '1');
  placeholder.setAttribute('role', 'button');
  placeholder.tabIndex = 0;

  const icon = document.createElement('i');
  icon.className = 'fas fa-lock';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'AvocadoGuestLink-label';
  text.textContent = label;

  placeholder.appendChild(icon);
  placeholder.appendChild(text);

  const handler = () => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal').then((M) => app.modal.show(M));
  placeholder.addEventListener('click', handler);
  placeholder.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handler();
  });

  return placeholder;
};

const gateGuestLinks = (component) => {
  if (app.session.user) return;
  if (!settingEnabled('avocadoHideLinksForGuests', false)) return;
  const root = component.element;
  if (!root) return;
  const body = root.querySelector('.Post-body');
  if (!body) return;

  // Only external links are replaced. Internal links (mentions, discussion links, etc.) are left untouched.
  // Post-body HTML is the formatter output already rendered by core; safe to mutate directly.
  const label = trans('ramon-avocado.forum.link_cta.placeholder', 'Login to view link');

  body.querySelectorAll('a[href]:not([data-avocado-gated])').forEach((link) => {
    if (!isExternalLink(link)) return;

    const placeholder = buildGuestLinkPlaceholder(label);
    const parent = link.parentNode;
    if (!parent) return;

    if (isRawUrlLink(link)) {
      parent.replaceChild(placeholder, link);
      return;
    }

    // Preserve the original link's visible text/markup so the surrounding
    // sentence still reads naturally, then append " (placeholder)" right after.
    while (link.firstChild) {
      parent.insertBefore(link.firstChild, link);
    }
    parent.insertBefore(document.createTextNode(' ('), link);
    parent.insertBefore(placeholder, link);
    parent.insertBefore(document.createTextNode(')'), link);
    parent.removeChild(link);
  });
};

// ─── Threads style: inject tagRow + title into the OP CommentPost ────────────
// Mirrors Avocado-threadView-tagRow + Avocado-threadView-title from kit.css.
// Structure after injection:
//   .Post-header  (meta: author · time)
//   .AvocadoThreads-tagRow  (tag pills — separate row)
//   h2.AvocadoThreads-title  (discussion title)
//   .Post-body    (full post content)
//   .Post-footer  (stats bar)
const initThreadsTitleBlock = (component) => {
  if (!settingEnabled('avocadoThreadsStyle', false)) return;
  const post = component.attrs?.post;
  if (post?.number?.() !== 1) return;
  const root = component.element as HTMLElement | null;
  if (!root || root.dataset.avocadoThreadsInited) return;

  const discussion = post.discussion?.();
  if (!discussion) return;

  const postMain = root.querySelector<HTMLElement>('.Post-main');
  const postHeader = postMain?.querySelector<HTMLElement>('.Post-header');
  if (!postMain || !postHeader) return;

  // ── Tag row (separate row below meta — matches .Avocado-threadView-tagRow) ──
  const tags = (discussion.tags?.() || []).filter(Boolean);
  const tagRow = document.createElement('div');
  tagRow.className = 'AvocadoThreads-tagRow';
  tags.forEach((tag) => {
    const pill = document.createElement('a');
    pill.className = 'AvocadoHome-tagPill';
    const color = tag.color?.();
    if (color) {
      const styleObj = tagPillStyle(color, 0.12);
      Object.entries(styleObj).forEach(([k, v]) => {
        if (k.startsWith('--')) pill.style.setProperty(k, String(v));
      });
    }
    const slug = tag.slug?.() || '';
    const href = app.route('tag', { tags: slug });
    pill.setAttribute('href', href);
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      m.route.set(href);
    });
    if (tag.icon?.()) {
      const icon = document.createElement('i');
      icon.className = tag.icon();
      icon.setAttribute('aria-hidden', 'true');
      pill.appendChild(icon);
      pill.appendChild(document.createTextNode('\u00A0'));
    }
    pill.appendChild(document.createTextNode(tag.name?.() || ''));
    tagRow.appendChild(pill);
  });

  // ── Title (matches .Avocado-threadView-title: 32px/900) ──────────────────────
  const titleEl = document.createElement('h2');
  titleEl.className = 'AvocadoThreads-title';
  titleEl.textContent = discussion.title?.() || '';

  // Insert: tagRow first, then title — both after Post-header
  postHeader.insertAdjacentElement('afterend', titleEl);
  postHeader.insertAdjacentElement('afterend', tagRow);

  root.dataset.avocadoThreadsInited = '1';
};

// ─── Threads style: add "Back" text to .DiscussionHero-back pill ─────────────
const addThreadsBackLabel = (root: HTMLElement | null) => {
  if (!settingEnabled('avocadoThreadsStyle', false) || !root) return;
  const backBtn = root.querySelector<HTMLElement>('.DiscussionHero-back');
  if (backBtn && !backBtn.querySelector('.DiscussionHero-back-label')) {
    const label = document.createElement('span');
    label.className = 'DiscussionHero-back-label';
    label.textContent = trans('ramon-avocado.forum.header.back', 'Back');
    backBtn.appendChild(label);
  }
};

app.initializers.add(
  'ramon-avocado',
  () => {
    // ── 0a. Remove the server-rendered custom-footer copy ─────────────────────
    // Flarum's blade emits the admin's custom footer TWICE worth of markup:
    //   1. <footer class="App-footer" id="footer"></footer> inside #app — an
    //      empty Mithril mount target (core's Footer.view() returns null);
    //   2. {!! $forum['footerHtml'] !!} — the admin's `custom_footer` HTML,
    //      printed RAW as a <body> child sitting between #app and #modal.
    //      See vendor/flarum/core/views/frontend/{app,forum}.blade.php.
    //
    // The avocado theme renders that HTML inside the in-#app mount instead
    // (block 25 below: the Footer.view override) so the layout stays inside
    // #app and core's pane-aware `margin-left: var(--pane-width)` keeps working.
    // The server-rendered body-level copy (#2) is therefore a duplicate and
    // must be removed — otherwise the page shows two footers.
    //
    // The old `body > footer#footer` selector only matched when the admin
    // happened to wrap their footer in exactly `<footer id="footer">`. Core
    // does NOT wrap `custom_footer`, so any other markup (a <div>, plain text,
    // a <footer> with a different id) left the duplicate in place. Instead we
    // clear every <body> node between #app and #modal: that span is exactly
    // the `custom_footer` output — head/foot Document injectors land in <head>
    // or after the boot scripts, never here.
    try {
      const appEl = document.getElementById('app');
      const modalEl = document.getElementById('modal');
      if (appEl && appEl.parentElement === document.body) {
        let node: ChildNode | null = appEl.nextSibling;
        while (node && node !== modalEl) {
          // Safety net: if #modal is somehow absent, never walk into the boot
          // scripts — stop before them rather than deleting the SPA payload.
          if (!modalEl && /^(script|noscript)$/i.test(node.nodeName)) break;
          const next: ChildNode | null = node.nextSibling;
          document.body.removeChild(node);
          node = next;
        }
      }
    } catch (_) {
      /* defensive — never block boot */
    }

    // ── 0. Register custom routes ─────────────────────────────────────────────
    // The /discussions page is always registered so direct links keep working.
    app.routes['avocado-team'] = { path: '/team', component: AvocadoTeamPage };
    app.routes['avocado-discussions'] = { path: '/discussions', component: AllDiscussionsPage };
    // Página "Salvos". Com o fof/bookmarks ativo quem registra a rota é ele
    // (registrar as duas derrubava o boot do Flarum — FastRoute recusa dois GET
    // no mesmo path, ver Support\BookmarksRoute); o tema então só troca o
    // componente, para a lista sair em ThreadCard como no resto do fórum.
    app.routes[usesFofBookmarks() ? 'fof-bookmarks' : 'avocado-bookmarks'] = {
      path: BOOKMARKS_PATH,
      component: AvocadoBookmarksPage,
    };
    // Replace Flarum's default PostsPage (/posts?q=) with our Avocado-styled version.
    app.routes['posts'] = { path: '/posts', component: AvocadoPostsSearchPage };
    // Unified search page — Discussions / Posts / Users tabs.
    app.routes['avocado-search'] = { path: '/search', component: AvocadoSearchPage };

    // Override the tags extension's individual tag route with our custom page.
    app.routes['tag'] = { path: '/t/:tags', component: AvocadoTagPage };
    // User profile pages — standalone Avocado components
    // 'user.posts' has the same path as 'user' and is processed after it by mapRoutes,
    // so it overwrites 'user' in the mithril route map. Override both to ensure our
    // component wins for /u/:username.
    app.routes['user'] = { path: '/u/:username', component: AvocadoUserPostsPage };
    app.routes['user.posts'] = { path: '/u/:username', component: AvocadoUserPostsPage };
    app.routes['user.discussions'] = { path: '/u/:username/discussions', component: AvocadoUserDiscussionsPage };
    app.routes['user.likes'] = { path: '/u/:username/likes', component: AvocadoUserLikesPage };
    app.routes['user.mentions'] = { path: '/u/:username/mentions', component: AvocadoUserMentionsPage };

    // ── 1. Theme class + logo override (needs app.forum — use beforeMount) ──────
    // initialize() runs before store.pushPayload() and before app.forum is set.
    // app.beforeMount() callbacks run after app.forum is set, before Mithril mounts.
    app.beforeMount(() => {
      // Preload eager removido — Lighthouse acusava ~537 KB de "JS não usado"
      // porque os 4 chunks baixavam mesmo em rotas que nunca os consomem
      // (home, /discussions, /tags). Em vez disso, AllDiscussionsPage e
      // TagPage têm `webpackPrefetch: true` na declaração (browser baixa em
      // idle); Search* e TeamPage carregam só na navegação.

      // Theme class on <html> — added whenever V2 is active
      document.documentElement.classList.add('avocado-theme');

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
              probe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:2000px;height:2000px;overflow:hidden;';
              document.body.appendChild(probe);
              probe.appendChild(svgEl);

              let tightViewBox = null;
              try {
                let x0 = Infinity,
                  y0 = Infinity,
                  x1 = -Infinity,
                  y1 = -Infinity;
                svgEl.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,text,image,use').forEach((el) => {
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
              // height is fixed at 50px for better visibility; width = 50 * (viewBox-width / viewBox-height).
              const LOGO_H = 50;
              let logoW = LOGO_H; // fallback: square
              if (tightViewBox) {
                const vbParts = tightViewBox.split(' ');
                const vbW = parseFloat(vbParts[2]);
                const vbH = parseFloat(vbParts[3]);
                if (vbW > 0 && vbH > 0) logoW = Math.round((LOGO_H * vbW) / vbH);
              }
              out.setAttribute('width', String(logoW));
              out.setAttribute('height', String(LOGO_H));
              out.setAttribute('class', 'Header-logo AvocadoLogoSvg');
              out.setAttribute('role', 'img');
              out.setAttribute('aria-label', app.forum.attribute('title') || '');
              out.style.display = 'block';
              out.style.margin = '0 auto';

              homeLink.textContent = '';
              homeLink.style.display = 'flex';
              homeLink.style.alignItems = 'center';
              homeLink.style.justifyContent = 'center';
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
      } else {
        // No Avocado custom logo — PHP may have hidden #home-link because Flarum has
        // a default logo image set. If so, reveal it once the <img> fires its load event.
        // The <img> is created by Mithril AFTER mount, so we watch with MutationObserver.
        const logoHide = document.getElementById('avocado-logo-hide');
        if (logoHide) {
          const homeLink = document.getElementById('home-link');
          const revealFn = () => {
            if (homeLink) homeLink.style.visibility = '';
            logoHide.remove();
          };
          // Safety net: reveal after 2.5 s even if img never fires load/error
          const tid = setTimeout(revealFn, 2500);
          const obs = new MutationObserver(() => {
            const img = document.querySelector<HTMLImageElement>('#home-link img.Header-logo');
            if (!img) return;
            obs.disconnect();
            clearTimeout(tid);
            if (img.complete && img.naturalWidth > 0) {
              revealFn();
            } else {
              img.addEventListener('load', revealFn, { once: true });
              img.addEventListener('error', revealFn, { once: true });
            }
          });
          obs.observe(document.documentElement, { childList: true, subtree: true });
        }
      }
    });

    // ── 1b. Global Avatar override — person silhouette for users without a photo
    override(Avatar.prototype, 'view', function (original, vnode) {
      if (!settingEnabled('avocadoCustomDefaultAvatar', true)) return original(vnode);
      const user = this.attrs?.user;
      if (!user || user.avatarUrl?.()) return original(vnode);

      const extraClass = this.attrs.className ? ` ${this.attrs.className}` : '';
      return (
        <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" className={`Avatar AvocadoDefaultAvatar${extraClass}`} aria-hidden="true">
          <circle cx="64" cy="64" r="64" className="AvocadoDefaultAvatar-bg" />
          <circle cx="64" cy="46" r="18" className="AvocadoDefaultAvatar-fg" />
          <path d="M64 70C42 70 24 82 24 96V128H104V96C104 82 86 70 64 70Z" className="AvocadoDefaultAvatar-fg" />
        </svg>
      );
    });

    // ── 2. UserPage (base for Security + Settings): Avocado layout ───────────
    // UserSecurityPage and SettingsPage are code-split chunks; override their
    // shared base (UserPage) which IS in the main bundle.
    override(UserPage.prototype, 'view', function () {
      const user = this.user;
      const isEditable = user && (user.canEdit?.() || user === app.session.user);
      const controls = user ? UserControls.controls(user, this).toArray() : [];
      return (
        <div className="AvocadoUserPage">
          <div className="AvocadoNav-helper">{buildUserPhoneNav(this)}</div>
          {buildHero(user, isEditable, controls)}
          {buildSidebar(this)}
          <div className="AvocadoUserPage-body">
            <div className="AvocadoUserPage-bodyInner">
              {user ? this.content() : <div className="AvocadoHome-threadStack">{renderThreadSkeleton()}</div>}
            </div>
          </div>
        </div>
      );
    });

    // ── 4. DiscussionHero: colored hero, white title, tag pills, state badges ────
    override(DiscussionHero.prototype, 'view', function (original, vnode) {
      const discussion = this.attrs.discussion;
      if (!discussion) return original(vnode);

      const tags = (discussion.tags?.() || []).filter(Boolean);
      const firstTag = tags[0] || null;
      const tagColor = firstTag?.color?.() || null;
      const color = tagColor || 'var(--primary-color)';

      // Optional per-discussion hero image set at creation time when the
      // selected tag was configured to ask for one. When present, the header
      // shows it as background with a darkening overlay so the title/meta
      // stay legible regardless of the photo's exposure.
      const discHeroUrl = getDiscussionHeroImageUrl(discussion);

      // The discussion's tag may grant the owner/mod the right to attach,
      // replace or remove the image. We only render the controls when:
      //  - at least one of the discussion's tags is in the admin allow-list
      //    (so this isn't a misplaced control on unrelated discussions); AND
      //  - the actor has rename permission (matches the backend check).
      const canManageHero = tagsRequireHeroImage(tags) && canEditDiscussionHero(discussion);

      // Avoid double-firing the upload while a request is in flight. Stored on
      // the component instance so it survives redraws.
      const startHeroUpload = () => {
        if ((this as any)._heroBusy) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          document.body.removeChild(input);
          if (!file) return;
          (this as any)._heroBusy = true;
          m.redraw();
          uploadDiscussionHeroImage(discussion.id(), file)
            .then((result) => {
              const attrs = (discussion as any).data?.attributes;
              if (attrs) {
                attrs.heroImagePath = result.heroImagePath;
                attrs.heroImageUrl = result.heroImageUrl;
              }
            })
            .catch(() => {
              try {
                app.alerts.show(
                  { type: 'error' },
                  trans('ramon-avocado.forum.home.composer_hero_image_upload_failed', 'Could not upload the hero image.')
                );
              } catch {
                /* noop */
              }
            })
            .finally(() => {
              (this as any)._heroBusy = false;
              m.redraw();
            });
        });
        input.click();
      };

      const removeHeroImage = () => {
        if ((this as any)._heroBusy) return;
        const ok = window.confirm(trans('ramon-avocado.forum.discussion.hero_image_remove_confirm', 'Remove the hero image from this discussion?'));
        if (!ok) return;
        (this as any)._heroBusy = true;
        m.redraw();
        deleteDiscussionHeroImage(discussion.id())
          .then(() => {
            const attrs = (discussion as any).data?.attributes;
            if (attrs) {
              attrs.heroImagePath = null;
              attrs.heroImageUrl = null;
            }
          })
          .catch(() => {
            /* keep the image, the next render will reflect actual state */
          })
          .finally(() => {
            (this as any)._heroBusy = false;
            m.redraw();
          });
      };

      // WCAG relative-luminance text contrast for hero. When the discussion
      // has a background image, the LESS layer adds a darkening overlay so
      // we always want white text regardless of tag color.
      const heroTextColor = discHeroUrl
        ? '#ffffff'
        : tagColor && tagColor.startsWith('#') && tagColor.replace('#', '').length === 6
          ? hexLuminance(tagColor) > 0.35
            ? '#202126'
            : '#ffffff'
          : '#ffffff';
      const heroTextMuted = heroTextColor === '#ffffff' ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.55)';
      const heroSurface = heroTextColor === '#ffffff' ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.10)';

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
      const participantCount =
        typeof apiCount === 'number' && apiCount > 0
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
      // participants only contains author + lastPoster (≤2 users loaded client-side).
      // Use the API participantCount as the authoritative total so "+N" reflects
      // the real number of people who participated, not just loaded avatars.
      const extraParticipants =
        participantCount > displayParticipants.length
          ? participantCount - displayParticipants.length
          : participants.length > MAX_PARTICIPANT_AVATARS
            ? participants.length - MAX_PARTICIPANT_AVATARS
            : 0;

      const renderParticipantAvatar = (user) => {
        if (!user) return null;
        const username = user.username?.();
        return (
          <span key={user.id?.()} className="DiscussionHero-participantAvatar" title={username}>
            <Avatar user={user} />
          </span>
        );
      };

      const isSticky = discussion.isSticky?.();
      const isLocked = discussion.isLocked?.();
      const isHidden = !!discussion.hiddenAt?.();
      const subscription = discussion.subscription?.();

      // Decoration icon: secondary tag icon on hero right side
      // Finds child tags (tags with parent) regardless of position
      // Ignores parent tags, maintains original tag order
      // Don't show any decoration icons on mobile (≤480px).
      // Two icons need more horizontal space — only render them on desktop (>767px)
      // to avoid the has-two-deco-icons padding-right compressing hero content on tablet.
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 480;
      const isTwoIconScreen = typeof window !== 'undefined' && window.innerWidth > 767;
      const showDecorationIcon = !!app.forum.attribute('avocadoHeroDecorationIcon') && !isMobile;
      const decorationOpacity = app.forum.attribute('avocadoHeroDecorationIconOpacity');
      const opacityValue = decorationOpacity ? Math.min(Math.max(parseInt(decorationOpacity) / 100, 0), 1) : 0.15;
      let iconCount = parseInt(app.forum.attribute('avocadoHeroDecorationIconCount') || '1');

      // Collect child tags (have parent)
      const childTags = tags.filter((t) => t.parent?.());
      const firstChildTag = childTags[0] || null;
      // Second tag only on desktop-wide screens (> 767px) to prevent layout compression
      const secondChildTag = iconCount >= 2 && isTwoIconScreen ? childTags[1] || null : null;

      const decorationIconClass = firstChildTag?.icon?.() || null;
      const decorationIconClass2 = secondChildTag?.icon?.() || null;
      const decorationTagColor = firstChildTag?.color?.() || null;
      const decorationTagColor2 = secondChildTag?.color?.() || null;
      const hasTwoDecoIcons = showDecorationIcon && isTwoIconScreen && iconCount >= 2 && !!decorationIconClass && !!decorationIconClass2;
      const showDecoDivider = hasTwoDecoIcons && !!app.forum.attribute('avocadoHeroDecoDivider');
      const decoDividerIcon = app.forum.attribute('avocadoHeroDecoDividerIcon') || 'fas fa-times';
      const decorationIconStyle = {
        ...(decorationOpacity ? { '--decoration-opacity': opacityValue } : {}),
      };

      const hasAnyDecoIcon = showDecorationIcon && !!decorationIconClass;
      const innerClass = [
        'DiscussionHero-inner',
        hasAnyDecoIcon ? 'has-deco-icon' : '',
        hasTwoDecoIcons ? 'has-two-deco-icons' : '',
        showDecoDivider ? 'has-deco-divider' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const heroClass = ['DiscussionHero', discHeroUrl ? 'DiscussionHero--withImage' : ''].filter(Boolean).join(' ');
      const heroStyle = {
        '--discussion-color': color,
        '--disc-hero-text': heroTextColor,
        '--disc-hero-text-muted': heroTextMuted,
        '--disc-hero-surface': heroSurface,
        ...(discHeroUrl ? { backgroundImage: safeCssUrl(discHeroUrl) } : {}),
      };

      const heroBusy = !!(this as any)._heroBusy;

      return (
        <header className={heroClass} style={heroStyle}>
          <div className="container">
            <div className={innerClass} style={decorationIconStyle}>
              {/* Hero image controls — only for users with rename permission
                  on a discussion whose tag asks for an image. */}
              {canManageHero && (
                <div className="DiscussionHero-imageControls">
                  {discHeroUrl ? (
                    <>
                      <button
                        type="button"
                        className="DiscussionHero-imageBtn"
                        onclick={startHeroUpload}
                        disabled={heroBusy}
                        aria-label={trans('ramon-avocado.forum.discussion.hero_image_replace', 'Replace image')}
                        title={trans('ramon-avocado.forum.discussion.hero_image_replace', 'Replace image')}
                      >
                        <i className={heroBusy ? 'fas fa-spinner fa-spin' : 'fas fa-camera'} aria-hidden="true" />
                        <span>{trans('ramon-avocado.forum.discussion.hero_image_replace', 'Replace image')}</span>
                      </button>
                      <button
                        type="button"
                        className="DiscussionHero-imageBtn DiscussionHero-imageBtn--danger"
                        onclick={removeHeroImage}
                        disabled={heroBusy}
                        aria-label={trans('ramon-avocado.forum.discussion.hero_image_remove', 'Remove image')}
                        title={trans('ramon-avocado.forum.discussion.hero_image_remove', 'Remove image')}
                      >
                        <i className="fas fa-trash" aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="DiscussionHero-imageBtn"
                      onclick={startHeroUpload}
                      disabled={heroBusy}
                      aria-label={trans('ramon-avocado.forum.discussion.hero_image_add', 'Add image')}
                      title={trans('ramon-avocado.forum.discussion.hero_image_add', 'Add image')}
                    >
                      <i className={heroBusy ? 'fas fa-spinner fa-spin' : 'fas fa-camera'} aria-hidden="true" />
                      <span>{trans('ramon-avocado.forum.discussion.hero_image_add', 'Add image')}</span>
                    </button>
                  )}
                </div>
              )}
              {/* Decoration icons wrapper — flexbox container for dynamic sizing */}
              {(showDecorationIcon && decorationIconClass) ||
              (showDecorationIcon && showDecoDivider) ||
              (showDecorationIcon && isTwoIconScreen && iconCount >= 2 && decorationIconClass2) ? (
                <div
                  className="DiscussionHero-decorationsContainer"
                  oncreate={(vnode) => {
                    // ResizeObserver to ensure icons render properly
                    const container = vnode.dom;
                    const observer = new ResizeObserver(() => {
                      // Just observe - don't modify layout to avoid conflicts with CSS padding
                      // This ensures icons render at their true size
                    });

                    // Observe container and all icons
                    observer.observe(container);
                    container.querySelectorAll('.DiscussionHero-decorationIcon, .DiscussionHero-decoSeparator').forEach((el) => {
                      observer.observe(el);
                    });

                    // Cleanup
                    vnode.dom._iconObserver = observer;
                  }}
                  onremove={(vnode) => {
                    if (vnode.dom._iconObserver) {
                      vnode.dom._iconObserver.disconnect();
                    }
                  }}
                >
                  {/* Decoration icon: first child tag icon */}
                  {showDecorationIcon && decorationIconClass && (
                    <div
                      className="DiscussionHero-decorationIcon is-visible"
                      style={decorationTagColor ? { '--tag-color-secondary': decorationTagColor } : {}}
                    >
                      <i className={decorationIconClass} aria-hidden="true" />
                    </div>
                  )}
                  {/* Divider icon between decoration icons */}
                  {showDecorationIcon && showDecoDivider && (
                    <div className="DiscussionHero-decoSeparator" aria-hidden="true">
                      <i className={decoDividerIcon} />
                    </div>
                  )}
                  {/* Decoration icon: second child tag icon (optional, desktop only) */}
                  {showDecorationIcon && isTwoIconScreen && iconCount >= 2 && decorationIconClass2 && (
                    <div
                      className="DiscussionHero-decorationIcon DiscussionHero-decorationIcon--second is-visible"
                      style={decorationTagColor2 ? { '--tag-color-secondary': decorationTagColor2 } : {}}
                    >
                      <i className={decorationIconClass2} aria-hidden="true" />
                    </div>
                  )}
                </div>
              ) : null}
              {/* Nav row: back button + badges + tag pills */}
              <nav className="DiscussionHero-nav">
                <button
                  className="DiscussionHero-back"
                  onclick={() => {
                    if (window.history.length > 1) window.history.back();
                    else m.route.set(app.route('index'));
                  }}
                  aria-label={trans('ramon-avocado.forum.back', 'Back')}
                >
                  <i className="fas fa-arrow-left" aria-hidden="true" />
                </button>

                <div className="DiscussionHero-pills">
                  {isSticky && (
                    <Tooltip text={trans('flarum-sticky.forum.badge.sticky_tooltip', 'Pinned')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--sticky"
                        role="img"
                        aria-label={trans('flarum-sticky.forum.badge.sticky_tooltip', 'Pinned')}
                      >
                        <i className="fas fa-thumbtack" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {isLocked && (
                    <Tooltip text={trans('flarum-lock.forum.badge.locked_tooltip', 'Locked')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--locked"
                        role="img"
                        aria-label={trans('flarum-lock.forum.badge.locked_tooltip', 'Locked')}
                      >
                        <i className="fas fa-lock" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {isHidden && (
                    <Tooltip text={trans('core.forum.post.hidden_text', 'Hidden')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--hidden"
                        role="img"
                        aria-label={trans('core.forum.post.hidden_text', 'Hidden')}
                      >
                        <i className="fas fa-eye-slash" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {subscription === 'follow' && (
                    <Tooltip text={trans('flarum-subscriptions.forum.badge.following_tooltip', 'Following')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--following"
                        role="img"
                        aria-label={trans('flarum-subscriptions.forum.badge.following_tooltip', 'Following')}
                      >
                        <i className="fas fa-star" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {subscription === 'ignore' && (
                    <Tooltip text={trans('flarum-subscriptions.forum.badge.ignoring_tooltip', 'Ignoring')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--ignoring"
                        role="img"
                        aria-label={trans('flarum-subscriptions.forum.badge.ignoring_tooltip', 'Ignoring')}
                      >
                        <i className="fas fa-eye-slash" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {tags.map((tag) => {
                    const tagColor = tag.color?.() || null;
                    const tagStyle = tagPillStyle(tagColor, 0.12);
                    return (
                      <a
                        key={tag.id()}
                        className="AvocadoHome-tagPill"
                        style={tagStyle}
                        href={app.route('tag', { tags: tag.slug() })}
                        onclick={(e) => {
                          e.preventDefault();
                          m.route.set(app.route('tag', { tags: tag.slug() }));
                        }}
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
                      <span
                        className="DiscussionHero-participantsMore"
                        title={`${participantCount} ${trans('ramon-avocado.forum.discussion.participant_plural', 'participants')}`}
                      >
                        +{extraParticipants}
                      </span>
                    )}
                  </div>
                )}
                <span className="DiscussionHero-metaItem">
                  <i className="far fa-comment" aria-hidden="true" />
                  {postCount}{' '}
                  {postCount === 1
                    ? trans('ramon-avocado.forum.discussion.post_singular', 'post')
                    : trans('ramon-avocado.forum.discussion.post_plural', 'posts')}
                </span>
                {participantCount > 0 && (
                  <span className="DiscussionHero-metaItem">
                    <i className="fas fa-users" aria-hidden="true" />
                    {participantCount}{' '}
                    {participantCount === 1
                      ? trans('ramon-avocado.forum.discussion.participant_singular', 'participant')
                      : trans('ramon-avocado.forum.discussion.participant_plural', 'participants')}
                  </span>
                )}
                <WhoIsReading discussion={discussion} />
              </div>
            </div>
          </div>
        </header>
      );
    });

    // ── 5. DiscussionPage skeleton override ───────────────────────────────────
    override(DiscussionPage.prototype, 'view', function (original, vnode) {
      if (this.discussion) return original(vnode);

      // Decoration icon skeleton — mirrors the exact same visibility rules as the real hero.
      // Try to use the cached discussion (already in store when navigating from the list)
      // to show the correct number of child-tag icons. Falls back to 1 icon on cache miss.
      const _routeId = String(m.route.param('id') ?? '');
      const _numericId = _routeId && !isNaN(parseInt(_routeId)) ? String(parseInt(_routeId)) : null;
      const _cachedDisc = _numericId ? app.store.getById('discussions', _numericId) : null;

      const _skelMobile = typeof window !== 'undefined' && window.innerWidth <= 480;
      const _skelTwoScreen = typeof window !== 'undefined' && window.innerWidth > 1129;
      const _skelShowDeco = !!app.forum.attribute('avocadoHeroDecorationIcon') && !_skelMobile;
      const _skelIconCount = parseInt(app.forum.attribute('avocadoHeroDecorationIconCount') || '1');

      // Determine icon presence + actual icon class from real child tags (mirrors DiscussionHero logic)
      let _skelHasFirstIcon = false;
      let _skelHasSecondIcon = false;
      let _skelFirstIconCls: string | null = null;
      let _skelSecondIconCls: string | null = null;
      if (_skelShowDeco) {
        if (_cachedDisc) {
          const _skelAllTags = (_cachedDisc.tags?.() || []).filter(Boolean);
          const _skelChildTags = _skelAllTags.filter((t) => t.parent?.());
          _skelHasFirstIcon = !!_skelChildTags[0];
          _skelHasSecondIcon = _skelTwoScreen && _skelIconCount >= 2 && !!_skelChildTags[1];
          _skelFirstIconCls = _skelChildTags[0]?.icon?.() || null;
          _skelSecondIconCls = _skelHasSecondIcon ? _skelChildTags[1]?.icon?.() || null : null;
        } else {
          // Cache miss (direct URL load) — safe assumption: 1 generic icon block
          _skelHasFirstIcon = true;
        }
      }

      const _skelHasTwo = _skelHasFirstIcon && _skelHasSecondIcon;
      const _skelHasDivider = _skelHasTwo && !!app.forum.attribute('avocadoHeroDecoDivider');

      return (
        <div className="Page DiscussionPage DiscussionPage--skeleton">
          <div className="Page-main">
            <div className="AvocadoSkeleton-discussionHero">
              <div className="container">
                {/* Mirrors .DiscussionHero-inner: position reference + centering + padding */}
                <div className="AvocadoSkeleton-heroInner">
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
                      {/* +more circle — mirrors DiscussionHero-participantsMore */}
                      <div className="AvocadoSkeleton-stackItem AvocadoSkeleton-stackItem--more" />
                    </div>
                    <div className="AvocadoSkeleton-metaChip AvocadoSkeleton-metaChip--md" />
                    <div className="AvocadoSkeleton-metaChip AvocadoSkeleton-metaChip--sm" />
                  </div>
                  {/* Decoration icon skeleton — mirrors real icon shape when cached */}
                  {_skelShowDeco && _skelHasFirstIcon && (
                    <div className={`AvocadoSkeleton-decoContainer${_skelHasTwo ? ' is-two' : ''}${_skelHasDivider ? ' has-divider' : ''}`}>
                      <div className={`AvocadoSkeleton-decoIcon${_skelFirstIconCls ? ' AvocadoSkeleton-decoIcon--icon' : ''}`}>
                        {_skelFirstIconCls && <i className={_skelFirstIconCls} aria-hidden="true" />}
                      </div>
                      {_skelHasDivider && (
                        <div className="AvocadoSkeleton-decoSep" aria-hidden="true">
                          <i className={app.forum.attribute('avocadoHeroDecoDividerIcon') || 'fas fa-times'} />
                        </div>
                      )}
                      {_skelHasTwo && (
                        <div className={`AvocadoSkeleton-decoIcon${_skelSecondIconCls ? ' AvocadoSkeleton-decoIcon--icon' : ''}`}>
                          {_skelSecondIconCls && <i className={_skelSecondIconCls} aria-hidden="true" />}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="Page-container container">
              {/* Sidebar FIRST (priority 100) — mirrors Flarum's containerItems() order.
                  With flex-direction:row-reverse the first DOM child ends up on the RIGHT. */}
              {renderDiscussionNavSkeleton(!!app.session.user)}
              <div className="Page-content">
                <div className="AvocadoSkeleton-stream">
                  {[0, 1, 2].map((i) => (
                    <div key={String(i)} className="AvocadoSkeleton-post">
                      <div className="AvocadoSkeleton-postAvatar" />
                      <div className="AvocadoSkeleton-postBody">
                        {/* Desktop/tablet: username line above content */}
                        <div className="AvocadoSkeleton-line AvocadoSkeleton-line--sm AvocadoSkeleton-line--user" />
                        {/* Mobile: inline avatar + username row (hidden on desktop via CSS) */}
                        <div className="AvocadoSkeleton-postHeader">
                          <div className="AvocadoSkeleton-postAvatarSm" />
                          <div className="AvocadoSkeleton-line AvocadoSkeleton-line--sm" />
                        </div>
                        <div className="AvocadoSkeleton-line AvocadoSkeleton-line--lg" />
                        <div className="AvocadoSkeleton-line AvocadoSkeleton-line--md" />
                        <div className="AvocadoSkeleton-line AvocadoSkeleton-line--sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    });

    // ── 6. Auth modal panel injection via Mithril content() override ─────────────
    // These modals are code-split chunks in Flarum 2.0 — static imports resolve to
    // undefined at load time. Dynamic imports are required. We kick off the Promise
    // at init so overrides are applied before the user can click "Log In".
    const authPanelOverride = (iconCls) =>
      function authContent(original) {
        // Admin can disable the custom side-panel design and fall back to
        // Flarum's default login / sign up / forgot-password modal.
        if (!settingEnabled('avocadoCustomAuthModal', true)) return original();

        const rawUrl = app.forum?.attribute('avocadoAuthImage') || app.forum?.attribute('avocadoHeroImage') || null;
        const heroUrl = rawUrl ? resolveAssetUrl(rawUrl) : null;
        return (
          <>
            <div className="AvocadoAuth-formIcon">
              <i className={iconCls} aria-hidden="true" />
            </div>
            <div
              className="AvocadoAuth-panel"
              style={heroUrl ? { backgroundImage: safeCssUrl(heroUrl), backgroundSize: 'cover', backgroundPosition: 'center top' } : {}}
              oncreate={(vnode) => {
                // CSS :has() can lose to Flarum's inline max-width on .Modal-dialog.
                // Use setProperty('…', 'important') so our inline style beats everything,
                // including any Flarum JS-set inline style. Target both .Modal-dialog and
                // .Modal as fallback (structure varies between Flarum 2.x builds).
                if (window.innerWidth >= 768) {
                  const targets = [vnode.dom.closest?.('.Modal-dialog'), vnode.dom.closest?.('.Modal')].filter(Boolean);
                  targets.forEach((el) => {
                    el.style.setProperty('max-width', '860px', 'important');
                    el.style.setProperty('width', '92vw', 'important');
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
      Promise.all([
        flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal'),
        flarum.reg.asyncModuleImport('flarum/forum/components/SignUpModal'),
        flarum.reg.asyncModuleImport('flarum/forum/components/ForgotPasswordModal'),
      ])
        .then(([LogInModal, SignUpModal, ForgotPasswordModal]) => {
          if (LogInModal.prototype.__avocadoPanelPatched) return;
          override(LogInModal.prototype, 'content', authPanelOverride('fas fa-lock'));
          override(SignUpModal.prototype, 'content', authPanelOverride('fas fa-user-plus'));
          override(ForgotPasswordModal.prototype, 'content', authPanelOverride('fas fa-envelope'));
          LogInModal.prototype.__avocadoPanelPatched = true;
        })
        .catch(() => {}); // graceful no-op if chunks unavailable
    }, 0);

    // ── 7b. HeaderSecondary auth buttons for guest users ──────────────────────
    extend(HeaderSecondary.prototype, 'items', function (items) {
      if (!settingEnabled('avocadoShowAuthButtons', false) || app.session.user) return;

      // Flarum 2.0 ItemList uses setContent() — replace() does not exist.
      // Keys: 'signUp' (capital U) and 'logIn'.
      if (items.has('signUp')) {
        items.setContent(
          'signUp',
          <button
            className="Button AvocadoHeader-authBtn AvocadoHeader-authBtn--signup"
            onclick={() => app.modal.show(() => flarum.reg.asyncModuleImport('flarum/forum/components/SignUpModal'))}
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
            onclick={() => app.modal.show(() => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal'))}
          >
            <i className="fas fa-sign-in-alt" aria-hidden="true" />
            {app.translator.trans('core.forum.header.log_in_link')}
          </button>
        );
      }

      if (items.has('logIn') && items.has('signUp')) {
        items.add('avocadoAuthSep', <span className="AvocadoHeader-authSep">{trans('ramon-avocado.forum.header.or', 'or')}</span>, 5);
      }
    });

    // ── 8b. IndexPage-newDiscussion: add aria-label (Flarum core renders it
    // as icon-only on mobile without an accessible name) ─────────────────────
    extend(IndexPage.prototype, 'oncreate', function () {
      const btn = this.element?.querySelector('.IndexPage-newDiscussion');
      if (btn && !btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', app.translator.trans('core.forum.index.start_discussion_button'));
      }
    });
    extend(IndexPage.prototype, 'onupdate', function () {
      const btn = this.element?.querySelector('.IndexPage-newDiscussion');
      if (btn && !btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', app.translator.trans('core.forum.index.start_discussion_button'));
      }
    });

    // ── 9. IndexPage oninit: redirect /?q=… to /search?q=… once per mount ──────
    // Placed in oninit (fires once per component mount) instead of contentItems
    // (fires on every Mithril redraw) to prevent multiple m.route.set calls
    // accumulating via setTimeout and causing the search page refresh loop.
    // Guard: skip when navigating back FROM a search-providing page so that
    // "Back to Discussion List" (href /?q=…) and browser Back from the search
    // page land on the real filtered IndexPage instead of looping back to search.
    extend(IndexPage.prototype, 'oninit', function () {
      if (!customHomeEnabled() && hasSearchQuery()) {
        const prevRoute = app.previous?.get?.('routeName');
        if (prevRoute === 'avocado-search' || prevRoute === 'posts') return;
        const params = app.search?.state?.params?.() || {};
        m.route.set(app.route('avocado-search', params), null, { replace: true });
      }
    });

    // ── 9c. DiscussionComposer (modal flow used by TagPage) ────────────────────
    // The core component is async-loaded by Flarum's chunk system, so a static
    // import returns undefined at boot. `asyncModuleImport` would force-load
    // the chunk during initializer time, which fails because `app.forum` is
    // still undefined at that point (chunkUrl reads `app.forum.attribute`).
    // `flarum.reg.onLoad` waits passively until the chunk loads on its own
    // (i.e. when the user opens the composer), then patches the prototype.
    // Adds an optional hero-image upload field below the title when one of
    // the selected tags is in `avocadoHeroImageTags`; on submit the file is
    // POSTed to /api/avocado/discussion-hero?discussionId=<id> and the user
    // is routed to the new discussion.
    flarum.reg.onLoad('core', 'forum/components/DiscussionComposer', (DiscussionComposer) => {
      extend(DiscussionComposer.prototype, 'oninit', function () {
        this._avocadoHeroFile = null;
        this._avocadoHeroPreview = null;
      });

      extend(DiscussionComposer.prototype, 'onremove', function () {
        if (this._avocadoHeroPreview) {
          try {
            URL.revokeObjectURL(this._avocadoHeroPreview);
          } catch {
            /* noop */
          }
          this._avocadoHeroPreview = null;
        }
      });

      extend(DiscussionComposer.prototype, 'headerItems', function (items) {
        const tags = this.composer?.fields?.tags || [];
        if (!tagsRequireHeroImage(tags)) return;

        const setFile = (file) => {
          if (this._avocadoHeroPreview) {
            try {
              URL.revokeObjectURL(this._avocadoHeroPreview);
            } catch {
              /* noop */
            }
          }
          this._avocadoHeroFile = file || null;
          this._avocadoHeroPreview = file ? URL.createObjectURL(file) : null;
          m.redraw();
        };

        const previewUrl = this._avocadoHeroPreview;
        const file = this._avocadoHeroFile;

        // Minimal chip: a single 32px-tall control that drops cleanly into the
        // composer header without disturbing layout. Toggles between an empty
        // "pick" button and a chip with a thumbnail + filename + remove.
        const chip = previewUrl ? (
          <span className="AvocadoHome-composerHeroChip is-set" title={file?.name || ''}>
            <span
              className="AvocadoHome-composerHeroChip-thumb"
              style={{ backgroundImage: `url(${JSON.stringify(previewUrl)})` }}
              aria-hidden="true"
            />
            <span className="AvocadoHome-composerHeroChip-label">
              {file?.name || trans('ramon-avocado.forum.home.composer_hero_image_picked', 'Image selected')}
            </span>
            <button
              type="button"
              className="AvocadoHome-composerHeroChip-remove"
              onclick={() => setFile(null)}
              aria-label={trans('ramon-avocado.forum.home.composer_hero_image_remove', 'Remove image')}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </span>
        ) : (
          <label className="AvocadoHome-composerHeroChip">
            <input
              type="file"
              accept="image/*"
              onchange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.type.startsWith('image/')) setFile(f);
                e.target.value = '';
              }}
            />
            <i className="fas fa-image" aria-hidden="true" />
            <span>{trans('ramon-avocado.forum.home.composer_hero_image_label', 'Hero image (optional)')}</span>
          </label>
        );

        items.add(
          'avocadoHeroImage',
          <div className="AvocadoHome-composerHeroChipRow AvocadoHome-composerHeroChipRow--modal">{chip}</div>,
          50 // between 'title' (100) and the editor
        );
      });

      override(DiscussionComposer.prototype, 'onsubmit', function (original) {
        const file = this._avocadoHeroFile;
        // No image picked — preserve original behavior verbatim.
        if (!file) {
          return original();
        }

        // Replicate core's flow but intercept the success branch so we can
        // upload the image before navigating to the new discussion.
        this.loading = true;
        const data = this.data();

        app.store
          .createRecord('discussions')
          .save(data)
          .then(async (discussion) => {
            try {
              const result = await uploadDiscussionHeroImage(discussion.id(), file);
              const attrs = discussion.data?.attributes;
              if (attrs) {
                attrs.heroImagePath = result.heroImagePath;
                attrs.heroImageUrl = result.heroImageUrl;
              }
            } catch (_err) {
              try {
                app.alerts.show(
                  { type: 'error' },
                  trans(
                    'ramon-avocado.forum.home.composer_hero_image_upload_failed',
                    'Could not upload the hero image. You can try again on the discussion page.'
                  )
                );
              } catch {
                /* alerts may be unavailable */
              }
            }
            this.composer.hide();
            app.discussions?.refresh?.();
            m.route.set(app.route.discussion(discussion));
          }, this.loaded.bind(this));
      });
    });

    // ── 9b. IndexPage contentItems: swap to HomePage ──────────────────────────
    extend(IndexPage.prototype, 'contentItems', function (items) {
      if (customHomeEnabled()) {
        items.remove('discussionList');
        items.remove('toolbar');
        items.add('avocadoHome', <HomePage />, 100);
      }
    });

    // ── 10. IndexPage view: setClassName for avocadoHome / avocadoSearch ──────
    extend(IndexPage.prototype, 'view', function (vdom) {
      if (!vdom) return;
      // IndexPage--avocadoRoot marks the REAL home/index page so PageStructure guards can
      // distinguish it from extension pages that also carry 'IndexPage' in their className
      // (e.g. LeaderboardPage uses className="IndexPage LeaderboardPage").
      setClassName(vdom, 'IndexPage--avocadoRoot', true);
      setClassName(vdom, 'IndexPage--avocadoHome', customHomeEnabled());
      setClassName(vdom, 'IndexPage--avocadoSearch', false);
    });

    // ── 12. IndexSidebar preload + items + navItems ────────────────────────────
    if (app.tagList?.load) {
      app.tagList.load(['children', 'parent']).catch(() => {});
    }

    // ── PageStructure: replace sidebar + strip hero for non-Discussion pages ──────
    // sidebar() → always AvocadoNav-helper so there is no visible Page-sidebar anywhere.
    //   On phone  : height:0 overflow:hidden — App-titleControl/App-primaryControl
    //               escape via position:absolute to the phone header.
    //   On tablet+: display:none — completely invisible.
    // mainItems() → remove the 'hero' slot for extension standalone pages;
    //   DiscussionPage keeps its custom hero; IndexPage handles WelcomeHero itself.
    override(PageStructure.prototype, 'sidebar', function (original) {
      if (this.attrs.className?.includes('DiscussionPage')) return original();
      return (
        <div className="AvocadoNav-helper">
          <IndexSidebar key={m.route.get()} />
        </div>
      );
    });

    // ── PageStructure hero suppression + extension page header ─────────────────
    // Guard: extension pages are anything that is NOT DiscussionPage and NOT the
    // real IndexPage (home). The real IndexPage always carries 'IndexPage--avocadoRoot'
    // (stamped above). Extension pages that piggyback the 'IndexPage' class
    // (e.g. LeaderboardPage uses className="IndexPage LeaderboardPage") do NOT have
    // 'IndexPage--avocadoRoot', so they are correctly treated as extension pages.
    const isExtensionPage = (cls) => !cls.includes('DiscussionPage') && !cls.includes('IndexPage--avocadoRoot');

    // Layer 1: remove the 'hero' item from the layout list.
    extend(PageStructure.prototype, 'mainItems', function (items) {
      if (isExtensionPage(this.attrs.className || '')) items.remove('hero');
    });

    // Layer 2: make providedHero() return null so that even if another extension's
    // extend() re-adds the 'hero' item after ours, it renders nothing.
    override(PageStructure.prototype, 'providedHero', function (original) {
      if (isExtensionPage(this.attrs.className || '')) return null;
      return original();
    });

    // Extension page header: replaces the hero with a title + back-to-home link
    // injected at the top of .Page-content#main-content.
    // app.title is set by each page's oncreate via app.setTitle(); it holds the
    // page-specific title string (without the forum name suffix).
    override(PageStructure.prototype, 'providedContent', function (original) {
      if (!isExtensionPage(this.attrs.className || '')) return original();
      return (
        <div className="Page-content" id="main-content">
          <div className="AvocadoExtensionPage-header">
            {app.title ? <h1 className="AvocadoExtensionPage-title">{app.title}</h1> : null}
            <a
              className="AvocadoExtensionPage-homeLink"
              href={app.route('index')}
              onclick={(e) => {
                e.preventDefault();
                m.route.set(app.route('index'));
              }}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
              {trans('ramon-avocado.forum.header.back_home', 'Back to Home')}
            </a>
          </div>
          {this.content}
        </div>
      );
    });

    // IndexSidebar.view: keep Flarum's IndexPage-nav/sideNav classes so core CSS
    // (@expand-side-nav expand behaviour, phone absolute positioning) still applies.
    // AvocadoExtensionNav is kept alongside so HomePage.less selectors still match.
    // The extension's sideNav.less uses .IndexPage-nav.sideNav (higher specificity)
    // to override Flarum core's sideNav styles with the avocado design.
    override(IndexSidebar.prototype, 'view', function () {
      return (
        <nav className="IndexPage-nav sideNav AvocadoExtensionNav">
          <ul>{listItems(this.items().toArray())}</ul>
        </nav>
      );
    });

    extend(IndexSidebar.prototype, 'items', function (items) {
      const nav = items.get('nav');
      if (nav?.attrs) {
        nav.attrs.defaultLabel = app.translator.trans('core.forum.index.all_discussions_link');
        nav.attrs.lazyDraw = false;
      }
    });

    extend(IndexSidebar.prototype, 'navItems', function (items) {
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
            {trans('ramon-avocado.forum.header.search', 'Search')}
          </LinkButton>,
          95
        );
      }

      // "Saved" — the bookmarks page, only for logged-in users (guests can't save).
      // Com o fof/bookmarks ativo quem põe o item aqui é ele (addBookmarksNavItem).
      if (app.session.user && avocadoBookmarksEnabled() && !items.has('avocadoBookmarks')) {
        items.add(
          'avocadoBookmarks',
          <LinkButton href={app.route('avocado-bookmarks')} icon="fas fa-bookmark">
            {trans('ramon-avocado.forum.bookmarks.title', 'Saved')}
          </LinkButton>,
          93
        );
      }

      if (!items.has('avocadoTeam') && app.forum?.attribute('avocadoTeamPageEnabled')) {
        const teamTitle = app.forum.attribute('avocadoTeamPageTitle') || trans('ramon-avocado.forum.team.title', 'Our Team');
        items.add(
          'avocadoTeam',
          <LinkButton href={app.route('avocado-team')} icon="fas fa-users">
            {teamTitle}
          </LinkButton>,
          90
        );
      }
    });

    // ── 12b. Bookmark action in discussion controls ────────────────────────────
    // Adds a "Save/Unsave" item to every discussion's controls dropdown — covers
    // the discussion page header and the card dropdowns in one integration point.
    // Gated on a logged-in actor; guests never see it.
    // Priority is kept BELOW core's reply button (default 0) so the discussion
    // page's SplitDropdown keeps "Reply" as the primary button and the save
    // action stays inside the dropdown panel, never promoted to the main button.
    // Com o fof/bookmarks ativo o item do dropdown é o dele (addDiscussionControls),
    // então o tema não põe o seu — o ícone no card continua funcionando e grava lá.
    extend(DiscussionControls, 'userControls', function (items: any, discussion: any) {
      if (!app.session.user || !avocadoBookmarksEnabled()) return;

      const saved = isBookmarked(discussion);
      items.add(
        'avocadoBookmark',
        <Button icon={saved ? 'fas fa-bookmark' : 'far fa-bookmark'} onclick={() => toggleBookmark(discussion)}>
          {saved ? trans('ramon-avocado.forum.bookmarks.unsave', 'Remove from saved') : trans('ramon-avocado.forum.bookmarks.save', 'Save')}
        </Button>,
        -10
      );

      // Nota/lembrete do bookmark — só faz sentido quando já está salvo.
      if (saved) {
        items.add(
          'avocadoBookmarkEdit',
          <Button icon="far fa-clock" onclick={() => app.modal.show(BookmarkModal, { discussion })}>
            {trans('ramon-avocado.forum.bookmarks.edit', 'Edit bookmark')}
          </Button>,
          -11
        );
      }
    });

    // ── 12b-bis. Bookmark de post no menu ⋯ (fof/bookmarks) ───────────────────
    // O Flarum 2 põe esse tipo de ação no dropdown do post, e é lá que o
    // discuss.flarum.org mostra — o header do post no tema já carrega nome,
    // badges e data, e um botão a mais ali fica solto. Quando o admin escolheu
    // 'header'/'actions' na extensão, o CSS esconde o botão dela (a ordem em que
    // os initializers rodam entre extensões não é garantida, então remover do
    // ItemList seria uma corrida) e o item abaixo entra no lugar. Com 'menu' a
    // extensão já põe o dela e o tema fica quieto, sem duplicar.
    extend(PostControls, 'userControls', function (items: any, post: any) {
      if (!app.session.user || !usesFofBookmarks() || fofPostButtonInMenu()) return;

      const marked = !!post?.attribute?.('bookmarked');

      items.add(
        'avocadoBookmark',
        <Button
          icon={marked ? 'fas fa-bookmark' : 'far fa-bookmark'}
          onclick={() => {
            post.save({ bookmarked: !marked }).catch(() => {
              app.alerts.show(
                { type: 'error' },
                trans('ramon-avocado.forum.bookmarks.toggle_error', 'Could not update your saved list. Please try again.')
              );
            });
          }}
        >
          {fofTrans(`postButton.${marked ? 'remove' : 'add'}`, marked ? 'Bookmarked' : 'Bookmark')}
        </Button>
      );
    });

    // ── 12c. Bookmark reminder notification ────────────────────────────────────
    // Backend type string (BookmarkReminderBlueprint::getType) and this key must
    // match byte-for-byte, or the alert renders blank. The renderer stays
    // registered even with the system disabled, so old alerts keep rendering;
    // only the preferences-grid row is gated.
    app.notificationComponents.avocadoBookmarkReminder = BookmarkReminderNotification;

    extend('flarum/forum/components/NotificationGrid', 'notificationTypes', function (items: any) {
      if (!avocadoBookmarksEnabled()) return;
      items.add('avocadoBookmarkReminder', {
        name: 'avocadoBookmarkReminder',
        icon: 'fas fa-bookmark',
        label: trans('ramon-avocado.forum.settings.notify_bookmark_reminder_label', 'Bookmark reminders'),
      });
    });

    // ── 12d. User hover card on post authors ───────────────────────────────────
    // Acopla o hover-card ao PRÓPRIO <h3 className="PostUser-name"> em vez de
    // envolvê-lo. Envolver o h3 (ou seu <a> interno) num wrapper o tirava de
    // "filho direto de .PostUser": quebrava nosso CSS (.PostUser-name > a) e
    // extensões que localizam o nó via vnode.children.find(match('PostUser-name'))
    // e então acessam header_node.children sem checar null — ex.: FoF Gamification
    // (addUserInfo) → "Cannot read properties of undefined (reading 'children')".
    // hoverCardAttrs() devolve {} quando o card está off, então isto vira no-op.
    extend('flarum/forum/components/PostUser', 'userViewItems', function (items: any, user: any) {
      if (!user || !items.has('postUser-name')) return;

      const name = items.get('postUser-name');
      if (name && name.attrs) Object.assign(name.attrs, hoverCardAttrs(user));

      // 🎂 no dia do aniversário de conta (entre o nome e os badges).
      items.add('avocadoCakeday', <CakedayBadge user={user} />, 95);
    });

    // O core tem seu próprio popover (CommentPost.showCard → UserCard--popover)
    // no mesmo hover — com o nosso card ativo, os dois abririam empilhados.
    // Anular showCard mantém cardVisible=false e o popover nativo nunca monta.
    override(CommentPost.prototype, 'showCard', function (original: () => void) {
      if (app.forum?.attribute('avocadoUserCardEnabled')) return;
      return original();
    });

    // ── 12e. Typing indicator restyle (flarum/realtime) ────────────────────────
    // O container padrão (.TypingUsersContainer) fica oculto via LESS e este
    // item o substitui: pill com avatares dos digitadores + três pontos
    // animados. Reusa o estado (getTypingUsers, definido pelo oninit do
    // realtime — existe independentemente da ordem de boot) e as strings de
    // tradução do próprio realtime. Sem ninguém digitando, o wrapper fica
    // vazio mas presente (min-height no LESS) para não deslocar o layout.
    extend('flarum/forum/components/PostStream', 'endItems', function (items: any) {
      if (typeof this.getTypingUsers !== 'function') return;
      if (!this.discussion?.attribute('canViewWhoTypes')) return;

      const names = Object.keys(this.getTypingUsers());
      const count = names.length;
      const max = 3;
      const showUsers = app.session.user?.preferences()?.['flarum-realtime.typing-indicator-full'] ?? true;

      const text =
        count > 0
          ? showUsers
            ? app.translator.trans('flarum-realtime.forum.typing-indicator.users-are-typing', {
                users: names.slice(0, max).join(', '),
                count,
                others: Math.max(count - max, 0),
              })
            : app.translator.trans('flarum-realtime.forum.typing-indicator.people-are-typing', { number: count })
          : null;

      const findAvatar = (name: string): string | null => {
        try {
          const user = (app.store.all('users') as any[]).find((u: any) => u.displayName?.() === name);
          return user?.avatarUrl?.() || null;
        } catch {
          return null;
        }
      };

      items.add(
        'avocadoTyping',
        <div className={`AvocadoTyping${count > 0 ? ' is-active' : ''}`} key="avocadoTyping" aria-live="polite">
          {count > 0 && (
            <div className="AvocadoTyping-pill">
              <span className="AvocadoTyping-avatars" aria-hidden="true">
                {names.slice(0, max).map((name) => {
                  const url = findAvatar(name);
                  return url ? (
                    <img key={name} className="AvocadoTyping-avatar" src={url} alt="" title={name} />
                  ) : (
                    <span key={name} className="AvocadoTyping-avatar AvocadoTyping-avatar--initial" title={name}>
                      {name.charAt(0).toUpperCase()}
                    </span>
                  );
                })}
              </span>
              <span className="AvocadoTyping-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="AvocadoTyping-text">{text}</span>
            </div>
          )}
        </div>,
        70
      );
    });

    // ── 13. WelcomeHero isHidden + view overrides ──────────────────────────────
    override(WelcomeHero.prototype, 'isHidden', function (original) {
      if (customHomeEnabled()) return true; // V2 home has its own banner
      if (hasSearchQuery()) return true; // Search results have no hero
      if (app.session.user) return true; // Logged-in users never see the banner
      if (app.forum?.attribute('avocadoHeroImage')) return false;
      return original();
    });

    override(WelcomeHero.prototype, 'view', function (original, vnode) {
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
        const kids = Array.isArray(result.children) ? result.children : result.children != null ? [result.children] : [];
        result.children = [imgEl, colorOverlay, ...kids];
        return result;
      }

      return (
        <header className="Hero WelcomeHero Hero--banner">
          {imgEl}
          {colorOverlay}
        </header>
      );
    });

    // ── 14. TagsPage: completely replace view ────────────────────────────────
    override(TagsPage.prototype, 'view', tagPageView);

    // ── 14b. DiscussionsSearchSource: point "see all" link to /search ─────────
    // The default points to app.route('index', {q}) → /all?q=...
    // We redirect that to the unified /search page.
    flarum.reg
      .asyncModuleImport('flarum/forum/components/DiscussionsSearchSource')
      .then((DiscussionsSearchSource) => {
        extend(DiscussionsSearchSource.prototype, 'view', function (vnode) {
          if (!vnode || !Array.isArray(vnode)) return;
          // Walk the vnode tree to update any href pointing to the index route.
          // app.route('index') may be '/' (root install) or '/all' — match by comparing
          // the path portion so both cases are handled.
          const indexBasePath = app.route('index').split('?')[0];
          const patchNode = (node) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {
              node.forEach(patchNode);
              return;
            }
            if (node.attrs?.href) {
              const href = node.attrs.href;
              if (typeof href === 'string' && href.split('?')[0] === indexBasePath) {
                const url = new URL(href, window.location.origin);
                url.pathname = app.route('avocado-search');
                node.attrs.href = url.pathname + url.search;
                const q = url.searchParams.get('q') || '';
                // Use replace:true when already on the search page to avoid accumulating
                // empty /search entries in browser history that Back would land on.
                node.attrs.onclick = (e) => {
                  e.preventDefault();
                  const onSearch = app.current.get('routeName') === 'avocado-search';
                  m.route.set(app.route('avocado-search', { q }), null, onSearch ? { replace: true } : {});
                };
              }
            }
            if (Array.isArray(node.children)) node.children.forEach(patchNode);
          };
          patchNode(vnode);
        });
      })
      .catch(() => {});

    // ── 14c. GlobalDiscussionsSearchSource: point "see all" link to /search ──────
    // The SearchModal (v2 native search) uses GlobalDiscussionsSearchSource.fullPage()
    // which links to /?q=… → IndexPage redirects to /search?q=… leaving an empty
    // /search entry in browser history. Fix: navigate directly to /search?q=… and
    // use replace:true when already on the search page (otherwise pushState).
    // Using a <button> (not <a>) ensures SelectResult() falls through to button.click()
    // so keyboard Enter navigation also picks up the replace logic.
    flarum.reg
      .asyncModuleImport('flarum/forum/components/GlobalDiscussionsSearchSource')
      .then((GlobalDiscussionsSearchSource) => {
        override(GlobalDiscussionsSearchSource.prototype, 'fullPage', function (_original, query: string) {
          const href = app.route('avocado-search', { q: query });
          return (
            <li>
              <button
                className="Button Button--link"
                onclick={(e: Event) => {
                  e.preventDefault();
                  const onSearch = app.current.get('routeName') === 'avocado-search';
                  m.route.set(href, null, onSearch ? { replace: true } : {});
                }}
              >
                <i className="fas fa-search icon Button-icon" aria-hidden="true" />
                <span className="Button-label">{app.translator.trans('core.lib.search_source.discussions.all_button', { query })}</span>
              </button>
            </li>
          );
        });
      })
      .catch(() => {});

    // ── 14d. SearchModal: Avocado spotlight UI (V2 search) ────────────────────
    // The native v2 SearchModal (flarum/common/components/SearchModal) is the
    // dialog opened when the user clicks the header search input.  We re-skin
    // it as an Avocado spotlight panel: pill tabs with FA icons, an ESC kbd
    // badge inside the input row, and a footer with arrow-key hints.
    //
    // Layout (CSS) lives in less/forum/SearchModal.less.  Here we only inject
    // the extra DOM that mockup requires.  SearchModal is lazy-loaded by
    // AbstractGlobalSearch.openSearchModal() — the string-based extend() defers
    // until flarum.reg.onLoad fires for that module.
    {
      const TAB_ICONS: Record<string, string> = {
        discussions: 'fas fa-comments',
        posts: 'fas fa-comment-dots',
        users: 'fas fa-user',
        tags: 'fas fa-tag',
      };

      const hasClass = (node: any, cls: string) => typeof node?.attrs?.className === 'string' && node.attrs.className.split(/\s+/).includes(cls);

      const findVnode = (root: any, predicate: (n: any) => boolean): any => {
        if (!root) return null;
        if (Array.isArray(root)) {
          for (const child of root) {
            const found = findVnode(child, predicate);
            if (found) return found;
          }
          return null;
        }
        if (typeof root !== 'object') return null;
        if (predicate(root)) return root;
        if (Array.isArray(root.children)) return findVnode(root.children, predicate);
        return null;
      };

      // 1. tabItems — give each tab Button an FA icon.  The Button component
      //    renders <Icon name={...} className="Button-icon"/> automatically
      //    when its `icon` attr is a string.
      extend('flarum/common/components/SearchModal', 'tabItems', function (items) {
        if (!items || typeof items.has !== 'function') return;
        const sources = (this as any).sources || [];
        sources.forEach((source: any) => {
          if (!items.has(source.resource)) return;
          const tab = items.get(source.resource);
          if (!tab || typeof tab !== 'object') return;
          tab.attrs = tab.attrs || {};
          tab.attrs.icon = TAB_ICONS[source.resource] || 'fas fa-search';
        });
      });

      // 2. content — append ESC kbd to the input row, footer to the body.
      //    Mithril memoises children arrays by reference, so we mutate in place
      //    and guard against double-injection across redraws.
      extend('flarum/common/components/SearchModal', 'content', function (vnode) {
        if (!vnode || typeof vnode !== 'object') return;
        const self: any = this;

        // Inject ESC button (acts as a real close button) inside .SearchModal-form
        const formRow = findVnode(vnode, (n) => hasClass(n, 'SearchModal-form'));
        if (formRow && Array.isArray(formRow.children)) {
          const already = formRow.children.some((c: any) => hasClass(c, 'Avocado-searchModal-kbd'));
          if (!already) {
            formRow.children.push(
              <button
                type="button"
                className="Avocado-searchModal-kbd Avocado-searchModal-kbd--close"
                aria-label={trans('ramon-avocado.forum.search.close', 'Close (Escape)')}
                onclick={(e: Event) => {
                  e.preventDefault();
                  self.hide?.();
                }}
              >
                {trans('ramon-avocado.forum.search.esc_key', 'ESC')}
              </button>
            );
          }
        }

        // Append footer to the modal body
        if (Array.isArray(vnode.children)) {
          const already = vnode.children.some((c: any) => hasClass(c, 'Avocado-searchModal-foot'));
          if (!already) {
            vnode.children.push(
              <div className="Avocado-searchModal-foot">
                <span>
                  {trans('ramon-avocado.forum.search.tip', 'Tip: prefix ')}
                  {/* eslint-disable-next-line i18n/no-hardcoded-text -- 'tag:' is the literal search operator users type */}
                  <strong>tag:</strong>
                  {trans('ramon-avocado.forum.search.tip_suffix', ' to filter by tag')}
                </span>
                <div className="Avocado-searchModal-foot-keys">
                  <span className="Avocado-searchModal-kbd" aria-hidden="true">
                    ↑
                  </span>
                  <span className="Avocado-searchModal-kbd" aria-hidden="true">
                    ↓
                  </span>
                  <span className="Avocado-searchModal-kbd" aria-hidden="true">
                    ↵
                  </span>
                </div>
              </div>
            );
          }
        }
      });

      // 3. activeTabItems — when a search is in flight, replace the default
      //    LoadingIndicator with skeleton placeholder rows so the layout doesn't
      //    collapse to a single spinner.  Only fires when the user has typed —
      //    empty query keeps the "start typing" empty state.
      extend('flarum/common/components/SearchModal', 'activeTabItems', function (items) {
        if (!items || typeof items.has !== 'function') return;
        const self: any = this;
        const activeResource = self.activeSource?.()?.resource;
        const loading = (self.loadingSources || []).includes(activeResource);
        const query = typeof self.query === 'function' ? (self.query() || '').trim() : '';
        if (!loading || !query) return;

        const skeletonRow = (i: number) => (
          <li key={`skel-${i}`} className="Avocado-searchSkeleton" aria-hidden="true">
            <span className="Avocado-searchSkeleton-av" />
            <div className="Avocado-searchSkeleton-body">
              <span className="Avocado-searchSkeleton-line Avocado-searchSkeleton-line--title" />
              <span className="Avocado-searchSkeleton-line Avocado-searchSkeleton-line--meta" />
            </div>
          </li>
        );

        if (!items.has('results')) return;
        items.setContent(
          'results',
          <div className="SearchModal-section">
            <hr className="Modal-divider" />
            <ul className="Dropdown-menu SearchModal-results SearchModal-results--skeleton" aria-busy="true" aria-live="polite">
              {[0, 1, 2, 3, 4].map(skeletonRow)}
            </ul>
          </div>
        );
      });

      // 4. clear — ESC inside the input is bound to KeyboardNavigatable.onCancel
      //    which calls clear().  Core's clear just empties the query; the user
      //    expects ESC to close the modal entirely (matches the kbd badge in
      //    the input row).  We dismiss instead of clearing.
      override('flarum/common/components/SearchModal', 'clear', function (_orig) {
        const self: any = this;
        self.hide?.();
      });

      // 5. setIndex — core's keyboard navigator scrolls $items.parent() into
      //    view, but our scroll container is `.SearchModal-tabs-content` (the
      //    Tabs body), not `.Dropdown-menu`. Without this override pressing ↑/↓
      //    moves focus correctly but the focused row stays off-screen.  We
      //    replicate core's algorithm against the right container.
      override('flarum/common/components/SearchModal', 'setIndex', function (_orig, index: number, scrollToItem: boolean = false) {
        const self: any = this;
        const $items = self.selectableItems();
        const $scroll = self.$('.SearchModal-tabs-content');

        let fixedIndex = index;
        if (index < 0) fixedIndex = $items.length - 1;
        else if (index >= $items.length) fixedIndex = 0;

        const $item = $items.removeClass('active').eq(fixedIndex).addClass('active');
        self.index = parseInt($item.attr('data-index') as string) || fixedIndex;

        if (!scrollToItem || !$scroll.length || !$item.length) return;

        const scrollTop = $scroll.scrollTop()!;
        const containerTop = $scroll.offset()!.top;
        const containerH = $scroll.outerHeight()!;
        const containerBot = containerTop + containerH;
        const itemTop = $item.offset()!.top;
        const itemBot = itemTop + $item.outerHeight()!;
        const padTop = parseInt($scroll.css('padding-top'), 10) || 0;
        const padBot = parseInt($scroll.css('padding-bottom'), 10) || 0;

        let target: number | undefined;
        if (itemTop < containerTop + padTop) {
          target = scrollTop + (itemTop - containerTop) - padTop;
        } else if (itemBot > containerBot - padBot) {
          target = scrollTop + (itemBot - containerBot) + padBot;
        }

        if (typeof target === 'number') {
          $scroll.stop(true).animate({ scrollTop: target }, 100);
        }
      });
    }

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
        if (Array.isArray(node)) {
          node.forEach(walkAndTruncate);
          return;
        }

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
      const color = firstTag?.color?.();
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

    // ── 18a. Posição dos badges de grupo no post ──────────────────────────────
    // O setting vira classes no <html>, e todo o desenho é CSS (ver
    // forum/PostBadges.less — a cápsula sai de `content: attr(aria-label)`, sem
    // reconstruir lista nenhuma). A classe vai na raiz, não no elemento da
    // página: o valor é do fórum inteiro, não muda de rota para rota, e a raiz
    // não é gerenciada pelo Mithril, então nenhum redraw pode apagá-la.
    //
    // `--custom` é a chave geral: TODA regra de PostBadges.less pende dela, então
    // o valor 'default' (desligado) sai sem classe nenhuma e o badge volta a ser
    // o disco do core sobreposto ao avatar, que é o que o tema desenha em
    // DiscussionPage.less. Desligar é o arquivo inteiro não valer, não um
    // conjunto de regras desfazendo o outro.
    //
    // Das posições, só as fora do padrão ganham classe própria — 'inline' é o
    // estado natural das regras, e para ela `--custom` basta. 'side_icons' leva
    // as DUAS: `--side` traz a coluna larga e a troca de lista, `--side-icons` é
    // só o modificador (fila em vez de pilha, disco em vez de cápsula).
    {
      const badgePosition = (): string => String(app.forum?.attribute('avocadoPostBadgePosition') || 'inline');
      const syncBadgePositionClass = () => {
        const pos = badgePosition();
        const root = document.documentElement.classList;
        root.toggle('avocado-badges--custom', pos !== 'default');
        root.toggle('avocado-badges--below', pos === 'below');
        root.toggle('avocado-badges--side', pos === 'side' || pos === 'side_icons');
        root.toggle('avocado-badges--side-icons', pos === 'side_icons');
      };
      // beforeMount roda depois de app.forum existir e antes do primeiro render.
      app.beforeMount(syncBadgePositionClass);
    }

    // ── 18b. CommentPost sideItems: wrap avatar + badges in position:relative div ─
    // position:sticky does NOT create a containing block for position:absolute
    // children. So we wrap both avatar and badges in a single div with
    // position:relative, then absolutely-position the badge inside that wrapper.
    // This guarantees the badge always overlaps the top corner of the avatar,
    // regardless of where the sticky Post-side is on screen.
    //
    // Duas coisas pedem este clone, e por motivos diferentes:
    //   - o efeito de avatar fixo, para ancorar o badge no canto da foto;
    //   - as posições "embaixo do avatar" (§18a), que precisam da lista DENTRO
    //     do .Post-side — o <ul> do cabeçalho não tem como ser movido para lá
    //     por CSS.
    // Elas são independentes: dá para querer os badges na coluna sem o avatar
    // fixo. Por isso o guarda testa as duas, e não só a primeira.
    extend(CommentPost.prototype, 'sideItems', function (items) {
      const badgesInSideColumn = ['side', 'side_icons'].includes(String(app.forum?.attribute('avocadoPostBadgePosition') || 'inline'));
      if (!settingEnabled('avocadoFixedAvatarEffect') && !badgesInSideColumn) return;
      // linkrobins/badge-labels turns each badge into a labelled pill and lays the
      // list out itself (below the avatar or beside the username). This clone is
      // built from `user.badges()` directly, so it bypasses that patch entirely:
      // rendering it would show the same badges a second time, unlabelled, inside
      // a 64px box. The extension marks its presence with a class on <html>.
      if (document.documentElement.classList.contains('lrBadgeLabels')) return;
      const user = this.attrs.post.user();
      if (!user) return;
      const badges = user.badges?.().toArray?.() ?? [];
      if (!badges.length) return;

      const avatarNode = items.get('avatar');
      items.remove('avatar');
      items.add(
        'avatar',
        <div className="Post-side-inner">
          {avatarNode}
          <ul className="PostUser-badges badges badges--packed PostUser-badges--inSide">{listItems(badges)}</ul>
        </div>,
        100
      );
    });

    // ── 19. CommentPost oncreate/onupdate (badges + duplicate avatar fix) ────────
    // Avatar duplicate: CSS in DiscussionPage.less already hides .PostUser-name .Avatar
    // via display:none !important — no JS removal needed (avatar.remove() caused removeChild
    // errors because Mithril still tracked the removed nodes in its vdom).
    //
    // Badges: instead of moving Mithril-managed nodes (which causes removeChild errors on
    // redraw), we keep the original in place and maintain a non-Mithril clone in Post-side.
    //
    // ── CTA: inject after configured post position (guest-only, configurable 1-5) ─
    // PostStream is code-split — use the string-based extend/override so that
    // flarum.reg.onLoad() applies the patch when the module finally loads.
    // This is the official pattern used by flarum/realtime (see TypingIndicator.tsx).
    {
      const getCtaPosition = () => {
        try {
          const pos = app.forum?.attribute('avocadoPostCtaPosition') ?? '1';
          const parsed = parseInt(pos, 10);
          return parsed >= 1 && parsed <= 5 ? parsed : 1;
        } catch (e) {
          return 1;
        }
      };

      const renderCta = () => (
        <div className="PostStream-item PostStream-avocadoCta">
          <div className="AvocadoPostCta-wrapper">
            <div className="AvocadoPostCta">
              <span className="AvocadoPostCta-text">{app.translator.trans('ramon-avocado.forum.post_cta.text')}</span>
              <span className="AvocadoPostCta-buttons">
                <Button
                  className="Button Button--primary AvocadoPostCta-btn AvocadoPostCta-btn--login"
                  icon="fas fa-sign-in-alt"
                  onclick={() => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal').then((M) => app.modal.show(M))}
                >
                  {app.translator.trans('core.forum.header.log_in_link')}
                </Button>
                <span className="AvocadoPostCta-or">{app.translator.trans('ramon-avocado.forum.post_cta.or')}</span>
                <Button
                  className="Button AvocadoPostCta-btn AvocadoPostCta-btn--signup"
                  icon="fas fa-user-plus"
                  onclick={() => flarum.reg.asyncModuleImport('flarum/forum/components/SignUpModal').then((M) => app.modal.show(M))}
                >
                  {app.translator.trans('core.forum.header.sign_up_link')}
                </Button>
              </span>
            </div>
          </div>
        </div>
      );

      const ctaEnabled = () => settingEnabled('avocadoShowPostCta', false);

      // Position 1: afterFirstPostItems — Flarum-native hook, fully Mithril-managed.
      // The PostStream core wraps post #1 + these items in an m.fragment when items
      // is non-empty. This is the idiomatic Flarum way to inject after the first post.
      extend('flarum/forum/components/PostStream', 'afterFirstPostItems', function (items) {
        if (!ctaEnabled() || app.session.user) return;
        if (getCtaPosition() === 1) items.add('avocado-post-cta', renderCta(), 100);
      });

      // Positions 2-5: extend view() and splice the CTA vnode after the N-th post.
      // We use extend (not override) so we don't swallow other extensions' view patches.
      // The mutation is safe because Mithril stores children by reference.
      extend('flarum/forum/components/PostStream', 'view', function (rootVnode) {
        if (!ctaEnabled() || app.session.user) return;

        const pos = getCtaPosition();
        if (pos === 1) return; // handled by afterFirstPostItems above

        const children = rootVnode?.children;
        if (!Array.isArray(children)) return;

        // Walk children counting only COMMENT posts (data-type="comment").
        // Event posts (stickied, locked, renamed…) carry a different data-type and
        // must not advance the counter — the user's position setting refers to
        // real comment posts only.
        let count = 0;
        for (let i = 0; i < children.length; i++) {
          const attrs = children[i]?.attrs;
          if (attrs?.['data-number'] && attrs?.['data-type'] === 'comment') {
            if (++count === pos) {
              children.splice(i + 1, 0, renderCta());
              break;
            }
          }
        }
      });
    }

    extend(CommentPost.prototype, 'oncreate', function () {
      syncUserOnline(this);
      gateGuestLinks(this);
      initCodeBlocks(this.element);
      fixReactionCounts(this.element);
      fixUnreactButton(this.element);
      initThreadsTitleBlock(this);
    });

    // FIX: guard before DOM ops — onupdate fires on every parent redraw.
    extend(CommentPost.prototype, 'onupdate', function () {
      syncUserOnline(this);
      gateGuestLinks(this);
      initCodeBlocks(this.element);
      fixReactionCounts(this.element);
      fixUnreactButton(this.element);
      initThreadsTitleBlock(this);
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

    // ── 21. PostEdited: show pencil icon instead of text ─────────────────────
    override(PostEdited.prototype, 'view', function () {
      const post = this.attrs.post;
      const editedUser = post.editedUser?.();
      const editedInfo = app.translator.trans('core.forum.post.edited_tooltip', { user: editedUser, ago: humanTime(post.editedAt?.()) });
      return (
        <Tooltip text={editedInfo}>
          <span className="PostEdited">
            <i className="fas fa-pencil-alt" aria-hidden="true" />
          </span>
        </Tooltip>
      );
    });

    // ── 21b. DiscussionControls userControls (reply icon) ─────────────────────
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
      const post = this.attrs?.post;
      if (post?.number?.() !== 1) return;
      items.add('avocado-op', <span className="AvocadoPost-opBadge">{trans('ramon-avocado.forum.post.op_badge', 'OP')}</span>, 50);
    });

    // ── 19d. DiscussionPage oncreate/onupdate: threads class + "Back" label ────
    // Using this.element.classList is more reliable than setClassName(vdom, ...)
    // because vdom from view() may be a PageStructure component node whose
    // className prop doesn't map directly to the rendered .Page.DiscussionPage div.
    const syncThreadsClass = (el: HTMLElement) => {
      if (!el) return;
      const enabled = settingEnabled('avocadoThreadsStyle', false);
      el.classList.toggle('avocado-threads', enabled);
    };

    extend(DiscussionPage.prototype, 'oncreate', function () {
      syncThreadsClass(this.element);
      addThreadsBackLabel(this.element);
    });
    extend(DiscussionPage.prototype, 'onupdate', function () {
      syncThreadsClass(this.element);
      addThreadsBackLabel(this.element);
    });

    // ── 19e. DiscussionPage sidebarItems: stats card ──────────────────────────
    // 'controls'@100, 'scrubber'@-100 — stats at 0 sits between them.
    extend(DiscussionPage.prototype, 'sidebarItems', function (items) {
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

    // ── 24. Protect ProseMirror from unsafe focus calls during drag events ─────
    // When dragging showcase cards or other elements, ProseMirror may try to
    // focus/blur the editor while it's being destroyed or not accessible.
    // We wrap the editor's focus/blur methods with safety checks.
    extend(TextEditor.prototype, 'buildEditorParams', function (params) {
      // Wrap the editor's focus method to handle undefined/destroyed editors
      const originalFocus = params.editor?.focus;
      if (originalFocus && typeof originalFocus === 'function') {
        params.editor.focus = function () {
          try {
            if (this && typeof originalFocus.call === 'function') {
              return originalFocus.call(this);
            }
          } catch (e) {
            // Silently ignore focus errors during drag or when editor is unmounted
            return;
          }
        };
      }
    });

    // Suppress focus-related errors that occur during drag events
    const originalError = window.onerror;
    window.onerror = function (msg, url, lineNo, colNo, error) {
      // Ignore "Cannot read properties of undefined (reading 'focus')" errors
      // These occur during drag events when editors are being mounted/unmounted
      if (msg && msg.includes && msg.includes('Cannot read properties of undefined') && msg.includes('focus')) {
        return true; // Suppress the error
      }
      if (typeof originalError === 'function') {
        return originalError(msg, url, lineNo, colNo, error);
      }
      return false;
    };

    // ── 25. Footer — render admin's custom_footer inside the Mithril mount ───
    // See bootstrap block 0a for the rationale (the server-rendered body-level
    // copy of this same HTML is removed there, so this mount is the only one).
    //
    // Two transformations on the admin HTML:
    //   1. <style> blocks are hoisted into <head>. They must be moved out of the
    //      Mithril-managed subtree because m.trust + Mithril patching can re-insert
    //      <style> nodes on every redraw, which causes the browser to re-evaluate
    //      the CSS and triggers a full style recomputation. Hoisting once at boot
    //      avoids that and guarantees the rules apply (head <style> is always live).
    //   2. Children of any <footer> wrapper are promoted to the root, since the
    //      Mithril mount itself is already <footer id="footer">. Avoids invalid
    //      <footer><footer>…</footer></footer> nesting and duplicate ids.
    let _avFooterContent: string | null = null;
    override(Footer.prototype, 'view', function () {
      if (_avFooterContent === null) {
        // Sanitize the admin-pasted HTML before parsing so on*= handlers and
        // dangerous schemes are stripped before any inner walk runs. <style>
        // blocks survive sanitization (the field's contract) and are still
        // hoisted into <head> below.
        const html = sanitizeAdminHtml(app.forum.attribute('footerHtml') as string);
        if (!html.trim()) {
          _avFooterContent = '';
        } else {
          const tmp = new DOMParser().parseFromString(html, 'text/html').body;

          // Hoist <style> tags into <head>, deduped by content.
          tmp.querySelectorAll('style').forEach((styleEl) => {
            const css = styleEl.textContent || '';
            const exists = [...document.head.querySelectorAll('style[data-avocado-footer]')].some((s) => s.textContent === css);
            if (!exists && css.trim()) {
              const moved = document.createElement('style');
              moved.setAttribute('data-avocado-footer', '1');
              moved.textContent = css;
              document.head.appendChild(moved);
            }
            styleEl.parentNode?.removeChild(styleEl);
          });

          // Promote any nested <footer>'s children to the root.
          tmp.querySelectorAll('footer').forEach((f) => {
            const parent = f.parentNode;
            if (!parent) return;
            while (f.firstChild) parent.insertBefore(f.firstChild, f);
            parent.removeChild(f);
          });

          _avFooterContent = tmp.innerHTML;
        }
      }
      return _avFooterContent ? trustedHtml(_avFooterContent) : null;
    });

    // ── Guest link gating ─────────────────────────────────────────────────────
    // When avocadoHideLinksForGuests is enabled, links inside post bodies are
    // replaced with a lock-icon placeholder. Clicking opens the login modal.

    // ── 26. MessagesPage: Avocado design integration ──────────────────────────
    // MessagesPage lives in a lazy webpack chunk (chunk 301 of flarum-messages).
    // At initializer time flarum.reg.get() returns undefined because the chunk
    // hasn't loaded yet.  We intercept flarum.reg.add() so the override is
    // applied the instant the chunk evaluates — whether that happens before or
    // after this initializer runs.

    // ── Inline reply component ───────────────────────────────────────────────
    // Uses Flarum's native TextEditor so the markdown toolbar (bold, italic,
    // headings, code, lists, mentions, …) is wired in automatically — same
    // editor surface as the discussion composer.
    //
    // Module-level tracker so the per-message Quote button (extended on
    // flarum-messages's Message.actionItems below) can push a quote into the
    // currently-mounted inline reply without prop drilling.
    let _currentInlineReply: any = null;

    class AvocadoInlineReply {
      oninit() {
        this.value = '';
        this.sending = false;
        // Minimal composer proxy expected by TextEditor / its toolbar items.
        this.composerProxy = {
          isVisible: () => true,
          fields: { content: () => this.value },
        };
        _currentInlineReply = this;
      }
      oncreate() {
        _currentInlineReply = this;
      }
      onremove() {
        if (_currentInlineReply === this) _currentInlineReply = null;
      }
      view(vnode) {
        const { dialog, onSent } = vnode.attrs;
        const user = app.session.user;
        return (
          <div className="AvocadoMessages-inlineReply">
            {user && <Avatar user={user} />}
            <div className="AvocadoMessages-inlineReply-wrap">
              <TextEditor
                composer={this.composerProxy}
                value={this.value}
                placeholder={app.translator.trans('flarum-messages.forum.composer.placeholder') as string}
                disabled={this.sending}
                onchange={(value) => {
                  this.value = value;
                  m.redraw();
                }}
                onsubmit={() => this._send(dialog, onSent)}
                submitLabel={app.translator.trans('flarum-messages.forum.messages_page.send_message_button')}
              />
            </div>
          </div>
        );
      }
      // Insert a Flarum-style BBCode quote at the top of the editor and focus
      // the textarea. Used by the per-message Quote button.
      insertQuote(quotedText: string, authorName: string) {
        const cleanText = String(quotedText || '').trim();
        const cleanAuthor = String(authorName || '').trim() || 'user';
        const block = `[quote=${cleanAuthor}]\n${cleanText}\n[/quote]\n\n`;
        const next = block + (this.value || '');
        this.value = next;
        m.redraw();
        // Sync the textarea: TextEditor reads `value` only on initial create,
        // so external mutations need to be pushed through the DOM directly so
        // BasicEditorDriver/onchange picks up the new content.
        setTimeout(() => {
          const ta = document.querySelector<HTMLTextAreaElement>('.AvocadoMessages-inlineReply .TextEditor-editor');
          if (!ta) return;
          ta.value = next;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.focus();
          // Place caret at end so user can immediately type their reply.
          try {
            ta.setSelectionRange(next.length, next.length);
          } catch (_) {}
        }, 30);
      }
      _send(dialog, onSent) {
        const text = this.value.trim();
        if (!text || this.sending) return;
        this.sending = true;
        m.redraw();
        // Use app.request directly to guarantee correct JSON:API relationship serialization.
        // Model.save({ dialog }) does not reliably serialize Model instances as relationships.
        app
          .request({
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
          })
          .then((response) => {
            try {
              app.store.pushPayload(response);
            } catch (_) {}
            this.value = '';
            this.sending = false;
            // Force the DOM textarea to clear too — TextEditor's BasicEditorDriver
            // is the source of truth after mount, so resetting `this.value` alone
            // won't empty the visible <textarea>.
            const ta = document.querySelector<HTMLTextAreaElement>('.AvocadoMessages-inlineReply .TextEditor-editor');
            if (ta) {
              ta.value = '';
              ta.style.height = ''; // reset auto-grown height
              ta.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (typeof onSent === 'function') onSent(response);
            m.redraw();
          })
          .catch(() => {
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
          { out: true, w1: '45%', w2: null },
          { out: false, w1: '60%', w2: '35%' },
          { out: true, w1: '50%', w2: '30%' },
          { out: false, w1: '40%', w2: null },
          { out: true, w1: '65%', w2: '20%' },
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
        if (!app.session.user?.canSendAnyMessage?.()) return items;

        const dialog = this.attrs.dialog;
        const scrollToBottom = () => {
          try {
            this.scrollToBottom();
          } catch (_) {}
        };
        const replyItem = (
          <div className="MessageStream-item" key="reply">
            <AvocadoInlineReply
              dialog={dialog}
              onSent={(response) => {
                const state = this.attrs.state;
                const dialog = this.attrs.dialog;
                // Use state.push() to append the sent message without a full reload.
                // Falls back to state.refresh() only if push is unavailable.
                try {
                  const msgId = response?.data?.id;
                  const msg = msgId ? app.store.getById('dialog-messages', msgId) : null;
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

        // ReplyPlaceholder is lazy-loaded inside core MessageStream.oninit, so
        // on the first render the 'reply' item is absent. Replace if present,
        // otherwise append — guarantees the input box always renders.
        const idx = items.findIndex((i) => i && i.key === 'reply');
        if (idx >= 0) items[idx] = replyItem;
        else items.push(replyItem);

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
          try {
            _origOnUpdate.call(this, vnode);
          } catch (_) {}
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
              // Mark deleted messages so CSS / view can render the placeholder.
              if (msg) {
                const isDeleted = !!(msg.isHidden?.() || msg.attribute?.('isHidden') || msg.attribute?.('hiddenAt') || msg.attribute?.('deletedAt'));
                const hasContent = !!(msg.contentHtml?.() || msg.attribute?.('content'));
                if (isDeleted || !hasContent) {
                  if (!classes.includes('Post--deleted')) classes.push('Post--deleted');
                }
              }
            });

            // Replace the body with a "mensagem apagada" placeholder when the
            // message is deleted/hidden. We override the rendered content via
            // the ItemList Flarum exposes for the message body.
            extend(MessageClass.prototype, 'view', function (vdom) {
              const msg = this.attrs.message;
              if (!msg) return;
              const isDeleted = !!(msg.isHidden?.() || msg.attribute?.('isHidden') || msg.attribute?.('hiddenAt') || msg.attribute?.('deletedAt'));
              const hasContent = !!(msg.contentHtml?.() || msg.attribute?.('content'));
              if (!isDeleted && hasContent) return;

              // Walk the vdom tree to find .Post-body and swap its children.
              const replace = (node: any): boolean => {
                if (!node || typeof node !== 'object') return false;
                if (Array.isArray(node)) {
                  node.forEach(replace);
                  return false;
                }
                const cls = node.attrs?.className;
                if (typeof cls === 'string' && cls.split(' ').includes('Post-body')) {
                  node.children = [
                    <span key="deleted" className="AvocadoMessages-deletedNotice">
                      <i className="fas fa-ban" aria-hidden="true" /> {trans('ramon-avocado.forum.messages.deleted_message', 'Mensagem apagada')}
                    </span>,
                  ];
                  return true;
                }
                if (Array.isArray(node.children)) return node.children.some(replace);
                return false;
              };
              replace(vdom);
            });

            // Add a per-message "Quote" button that pushes a BBCode quote into
            // the inline reply (uses Flarum's standard [quote=name]...[/quote]
            // syntax so flarum-mentions / flarum-bbcode render it correctly).
            extend(MessageClass.prototype, 'actionItems', function (items) {
              const msg = this.attrs.message;
              if (!msg) return;
              if (!app.session.user?.canSendAnyMessage?.()) return;
              if (items.has?.('quote')) return;

              items.add(
                'quote',
                <Button
                  className="Button Button--link AvocadoMessages-quoteBtn"
                  icon="fas fa-reply"
                  onclick={() => {
                    const author = displayName(msg.user?.()) || msg.user?.()?.username?.() || '';
                    // Prefer the raw markdown source so the quote round-trips
                    // formatting; fall back to plaintext if the model only
                    // exposes the rendered version.
                    const content = msg.attribute?.('content') ?? msg.contentPlain?.() ?? '';
                    if (_currentInlineReply) {
                      _currentInlineReply.insertQuote(content, author);
                    }
                  }}
                  aria-label={app.translator.trans('flarum-mentions.forum.post.reply_link', {}, true) || 'Reply'}
                  title={app.translator.trans('flarum-mentions.forum.post.reply_link', {}, true) || 'Reply'}
                >
                  {app.translator.trans('flarum-mentions.forum.post.reply_link', {}, true) || 'Reply'}
                </Button>,
                50
              );
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
            { out: true, w1: '45%', w2: null },
            { out: false, w1: '60%', w2: '35%' },
            { out: true, w1: '50%', w2: '30%' },
            { out: false, w1: '40%', w2: null },
            { out: true, w1: '65%', w2: '20%' },
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
          {[1, 2, 3, 4, 5].map((i) => (
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
        items.add(
          'newMessage',
          <button
            type="button"
            className="Button Button--icon AvocadoMessages-composeBtn"
            aria-label={app.translator.trans('flarum-messages.forum.messages_page.send_message_button')}
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
            <span className="Button-label" />
          </button>,
          30
        );
      });

      override(MsgPage.prototype, 'view', function () {
        patchMessageClass();

        // Show full skeleton only on very first load (before any dialog has been fetched)
        const isLoading = app.dialogs.isLoading() && !_msgPageFullyLoaded;

        // Show switch skeleton whenever the URL dialog ID doesn't match the
        // currently loaded dialog — purely synchronous, no async flag needed.
        const routeId = String(m.route.param('id') ?? '');
        const loadedId = String(this.selectedDialog?.()?.id?.() ?? '');
        const isSwitching = !isLoading && !!routeId && routeId !== loadedId;

        const hasDialog = (!!this.selectedDialog?.() || isSwitching) && !isLoading;
        const cardClass = 'AvocadoMessages-card' + (hasDialog ? ' AvocadoMessages-card--onDialog' : '');

        const items = this.contentItems();
        const sidebarVnode = items.get('sidebar');
        const dialogVnode = items.get('dialog');

        // FORCE re-create of dialog component with a unique key tied to dialog ID
        // This ensures MessageStream.oncreate() is called when dialog changes
        const dialogId = this.selectedDialog?.()?.id?.();
        const forceRecreatKey = isLoading ? 'loading' : isSwitching ? 'switching' : `dialog-${dialogId}`;

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
            <div className="AvocadoNav-helper">
              <IndexSidebar key={m.route.get()} />
            </div>
            <div className={cardClass}>
              <div className="AvocadoMessages-listCol">{isLoading ? renderMsgListSkeleton() : sidebarVnode}</div>
              <div className="AvocadoMessages-chatCol" onclick={handleBackClick}>
                {isLoading ? renderMsgChatSkeleton() : isSwitching ? renderDialogSwitchSkeleton() : dialogVnode}
              </div>
            </div>
          </div>
        );
      });

      // ── Guard and verify realtime listeners are active (fallback) ────────────
      // If for some reason oncreate is not called, this ensures channels exist
      extend(MsgPage.prototype, 'onupdate', function () {
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
          return app.websocket?.connection?.state === 'connected' || !!window.Echo;
        } catch (_) {
          return false;
        }
      };

      const poll = () => {
        if (document.hidden) return;
        if (!app.session?.user) return;
        if (isWebSocketActive()) return;

        const userId = app.session.user.id?.();
        if (!userId) return;

        app
          .request({
            method: 'GET',
            url: `${app.forum.attribute('apiUrl')}/users/${userId}`,
            errorHandler: () => {},
          })
          .then((payload) => {
            app.store.pushPayload(payload);
            m.redraw();
          })
          .catch(() => {});

        if (typeof app.dialogs?.load === 'function') {
          try {
            app.dialogs.load();
          } catch (_) {}
        }
      };

      setTimeout(() => {
        poll();
        setInterval(poll, INTERVAL_MS);
      }, 5000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) poll();
      });
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
        try {
          if (data) app.store.pushPayload(data);
        } catch (_) {}
        m.redraw();
      };

      const onDialog = (data) => {
        // Push the payload so the store is up-to-date.
        // flarum/messages' own extendRealtime already calls state.push(message)
        // and app.dialogs.refresh() — we must NOT call load/refresh again here
        // or the stream will do a full reload (the "freeze" the user sees).
        try {
          if (data) app.store.pushPayload(data);
        } catch (_) {}
        m.redraw();
      };

      const bindChannels = () => {
        try {
          if (!app.websocket) return false;

          // Public channel — for guests and as fallback for logged-in users.
          const pub = app.websocket.subscribe('public');
          if (!pub._avBound) {
            pub._avBound = true;
            pub.bind('likesMutation', onPayload);
            pub.bind('discussionPinned', onPayload);
          }

          // Private user channel — personalised payload for logged-in users.
          if (app.session?.user) {
            const priv = app.websocket.subscribe(`private-user=${app.session.user.id()}`);
            if (!priv._avBound) {
              priv._avBound = true;
              priv.bind('likesMutation', onPayload);
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
              if (app.websocket_channels.public) rs.notifyPublicChannelReady?.(app.websocket_channels.public);
              if (app.websocket_channels.user) rs.notifyUserChannelReady?.(app.websocket_channels.user);
            }
          }

          return true;
        } catch (_) {
          return false;
        }
      };

      // Poll until app.websocket is initialised (set during Application.mount).
      const MAX = 15_000,
        TICK = 300;
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

    // ── 25. Phone: no dropdown flash before the notifications page ────────────
    // Core's HeaderDropdown.onclick() navigates to the full page (goToRoute)
    // when the drawer is open, but the toggle button still carries Bootstrap's
    // data-toggle="dropdown". Bootstrap's delegated handler on `document` fires
    // right after this onclick, so the bottom-sheet panel slides in for a frame
    // until Page.oninit → app.drawer.hide() tears the drawer down. The result is
    // the "small panel flashes, then the full page opens" the user sees.
    //
    // Stopping propagation here keeps the event from reaching Bootstrap, so only
    // the route change happens. Mithril binds onclick directly on the button, so
    // it runs in the target phase — before the document-level handler.
    override(HeaderDropdown.prototype, 'onclick', function (original, e) {
      if (!app.drawer?.isOpen?.()) return original(e);

      e?.preventDefault?.();
      e?.stopPropagation?.();
      this.goToRoute();
    });

    // ── Colored integration ───────────────────────────────────────────────────
    // Applies the first tag's color to the entire page (primary color, links,
    // buttons, header) via CSS custom properties set on <body>.
    // Ported from ramon/colored; LESS rules live in forum/colored.less.

    app.beforeMount(() => {
      const enabled = !!app.forum.attribute<boolean>('avocadoColoredEnabled');
      const borderStyle = enabled ? app.forum.attribute<string>('avocadoColoredBorderStyle') || 'none' : 'none';
      document.documentElement.setAttribute('data-avocado-colored-border', borderStyle);
      // Colored header is driven by Flarum's own data-colored-header attribute (set by
      // FrontendServiceProvider). No avocado attribute needed — see colored.less selector.
    });

    // DiscussionListItem: inject --item-tag-color for native Flarum list border rules
    // + apply color on click so the discussion page opens pre-colored.
    extend(DiscussionListItem.prototype, 'view', function (vdom) {
      const tags = sortTags((this.attrs.discussion?.tags?.() as any[]) || []);
      const color: string | null = tags.length ? (tags[0] as any).color?.() : null;
      if (!color || !vdom?.attrs) return;

      vdom.attrs.style = { ...(vdom.attrs.style || {}), '--item-tag-color': color };

      if (!app.forum.attribute<boolean>('avocadoColoredEnabled')) return;
      const prev = vdom.attrs.onclick;
      vdom.attrs.onclick = (e: MouseEvent) => {
        applyColor(color);
        if (typeof prev === 'function') (prev as Function).call(this, e);
      };
    });

    // DiscussionHero: apply body-level color when entering a discussion,
    // and clear it when leaving (color snaps via suppressTransitions in applyColor).
    extend(DiscussionHero.prototype, 'oninit', function () {
      if (!app.forum.attribute<boolean>('avocadoColoredEnabled')) return;
      const tags = sortTags((this.attrs.discussion?.tags?.() as any[]) || []);
      applyColor(tags.length ? (tags[0] as any).color?.() : null);
    });
    extend(DiscussionHero.prototype, 'onupdate', function () {
      if (!app.forum.attribute<boolean>('avocadoColoredEnabled')) return;
      const tags = sortTags((this.attrs.discussion?.tags?.() as any[]) || []);
      applyColor(tags.length ? (tags[0] as any).color?.() : null);
    });
    extend(DiscussionHero.prototype, 'onremove', function () {
      clearColor();
    });
  },
  -10
);

// ─── fof/reactions: suppress "Your reaction was converted" warning ─────────────
// The extension fires app.alerts.show({type:'warning'}, transString) after a
// reaction is removed and the gamification/likes integration is active.
// This alert breaks the seamless UX, so we intercept and silently drop it.
//
// Approach: patch app.translator.trans() so the warning key returns null.
// Then patch app.alerts.show() to skip null/falsy children on warning alerts.
// Double-patching is necessary because trans() may return a VNode array in some
// Flarum 2 locales, making string comparison unreliable.
app.initializers.add(
  'avocado-suppress-reaction-converted-warning',
  () => {
    const SUPPRESS_KEY = 'fof-reactions.forum.warning';

    // Patch 1: translator → return null for the warning key
    const origTrans = app.translator.trans.bind(app.translator);
    (app.translator as any).trans = function (key: string, ...rest: any[]) {
      if (key === SUPPRESS_KEY) return null;
      return origTrans.apply(app.translator, [key, ...rest] as any);
    };

    // Patch 2: alerts.show → skip null/empty warning children
    const _show = app.alerts.show.bind(app.alerts);
    (app.alerts as any).show = function (attrs: any, children: any) {
      if (attrs?.type === 'warning' && (children === null || children === '' || children === undefined)) return;
      return _show.call(app.alerts, attrs, children);
    };
  },
  -200
);
