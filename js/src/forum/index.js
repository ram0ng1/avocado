import { extend, override } from 'flarum/common/extend';
import DiscussionListItem from 'flarum/forum/components/DiscussionListItem';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import Search from 'flarum/forum/components/Search';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import CommentPost from 'flarum/forum/components/CommentPost';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import WelcomeHero from 'flarum/forum/components/WelcomeHero';
import TagsPage from 'ext:flarum/tags/forum/components/TagsPage';
import AvocadoTagsPage from './components/TagsPage';
import { truncate } from 'flarum/common/utils/string';

const parseBoolean = (value, defaultValue = true) => {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return Boolean(value);
};

// Checked at render time — not at boot time.
const settingEnabled = (key, defaultValue = true) => {
  return parseBoolean(app.forum?.attribute(key), defaultValue);
};

const trans = (key, fallback) => {
  const out = app.translator?.trans(key);
  return out && out !== key ? out : fallback;
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

const getPostPermalink = (post) => {
  const discussion = post?.discussion?.();
  if (!discussion) return window.location.href;

  const near = typeof post.number === 'function' ? post.number() : undefined;
  const relative = app.route.discussion(discussion, near);
  return new URL(relative, window.location.origin).toString();
};

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('input');
  input.value = text;
  input.setAttribute('readonly', 'readonly');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
};

const syncFixedAvatarBadges = (component) => {
  const root = component.element;
  if (!root) return;

  const postUser = root.querySelector('.Post-header .PostUser') || root.querySelector('.PostUser');
  const side = root.querySelector('.Post-side');
  const badges = root.querySelector('.PostUser-badges');
  if (!postUser || !side || !badges) return;

  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  const shouldInlineInHeader = settingEnabled('avocadoFixedAvatarEffect') && root.classList?.contains('CommentPost--fixedAvatar') && isDesktop;

  if (!shouldInlineInHeader) {
    if (badges.parentElement !== side) {
      side.appendChild(badges);
    }
    badges.classList.remove('PostUser-badges--inPostHeader');

    badges.querySelectorAll('.Badge').forEach((badge) => {
      badge.removeAttribute('data-placement');
    });
    return;
  }

  if (badges.parentElement !== postUser) {
    postUser.appendChild(badges);
  }
  badges.classList.add('PostUser-badges--inPostHeader');

  // Keep tooltip visible under the fixed header when badge is near top edge.
  badges.querySelectorAll('.Badge').forEach((badge) => {
    const nearTop = badge.getBoundingClientRect().top < 92;
    if (nearTop) {
      badge.setAttribute('data-placement', 'bottom');
    } else {
      badge.removeAttribute('data-placement');
    }
  });
};

const queueSyncFixedAvatarBadges = (component) => {
  syncFixedAvatarBadges(component);
  requestAnimationFrame(() => syncFixedAvatarBadges(component));
  setTimeout(() => syncFixedAvatarBadges(component), 120);
};

app.initializers.add(
  'ramon-avocado',
  () => {
    // ── Sidebar nav preload (avoid temporary "Loading..." item) ─────────────
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
      if (items.has('loading')) {
        items.remove('loading');
      }
    });

    // ── WelcomeHero banner override ───────────────────────────────────────────
    // Checked at render time so it always sees the current setting value.
    //
    // Problem 1: isHidden() returns true when welcomeTitle is empty, so the
    //            hero element never mounts and the banner can never appear.
    // Problem 2: relying on CSS variables set at boot time can miss re-renders.
    // Solution:  override view() to apply backgroundImage as an inline style
    //            directly on the element — no CSS variable needed.

    override(WelcomeHero.prototype, 'isHidden', function (original) {
      if (app.forum?.attribute('avocadoHeroImage')) return false;
      return original();
    });

    override(WelcomeHero.prototype, 'view', function (original, vnode) {
      const heroImage = app.forum?.attribute('avocadoHeroImage');

      if (!heroImage) return original(vnode);

      // Build the full URL — support both uploaded filename and manual full URL.
      const heroUrl = resolveAssetUrl(heroImage);

      const pos = app.forum?.attribute('avocadoHeroImagePosition') || 'center top';

      // <img> instead of background-image: discoverable by preload scanner,
      // fetchpriority="high" tells the browser this is the LCP element.
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

      const result = original(vnode);

      if (result && result.attrs) {
        result.attrs.className = (result.attrs.className || '') + ' Hero--banner';
        const kids = Array.isArray(result.children)
          ? result.children
          : result.children != null ? [result.children] : [];
        result.children = [imgEl, ...kids];
        return result;
      }

      // Hero returned null (no welcomeTitle) — render bare hero for the banner
      return <header className="Hero WelcomeHero Hero--banner">{imgEl}</header>;
    });

    // ── TagsPage ──────────────────────────────────────────────────────────────
    override(TagsPage.prototype, 'tagTileListView', AvocadoTagsPage.prototype.tagTileListView);
    override(TagsPage.prototype, 'tagTileView', AvocadoTagsPage.prototype.tagTileView);
    override(TagsPage.prototype, 'cloudView', AvocadoTagsPage.prototype.cloudView);

    // ── V1 Search — always registered, checked on each render ─────────────────
    override(GlobalSearch.prototype, 'view', function (original, ...args) {
      if (!settingEnabled('avocadoSearchV1')) return original.apply(this, args);
      return <Search state={this.searchState} />;
    });

    extend(Search.prototype, 'view', function (vnode) {
      if (!settingEnabled('avocadoSearchV1')) return;
      if (!vnode || !Array.isArray(vnode.children)) return;

      // ── Search-input: inject prefix icon ──────────────────────────────────
      const searchInput = vnode.children.find(
        (c) => c && c.attrs && typeof c.attrs.className === 'string' && c.attrs.className.includes('Search-input')
      );
      if (searchInput) {
        searchInput.attrs.className = 'Input Search-input Input--withPrefix Input--withClear';
        if (Array.isArray(searchInput.children)) {
          searchInput.children.unshift(<i aria-hidden="true" className="icon fas fa-search Input-prefix-icon" />);
        }
      }

      // ── Excerpt: truncate to 200 chars ────────────────────────────────────
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

    // ── DiscussionListItem ────────────────────────────────────────────────────
    extend(DiscussionListItem.prototype, 'elementAttrs', function (attrs) {
      if (this.attrs.discussion.tags()?.[0]?.color()) {
        attrs.style = { '--tag-color': this.attrs.discussion.tags()[0].color(), ...(attrs.style || {}) };
      }
      if (this.attrs.discussion.isUnread()) {
        attrs.className = `${attrs.className || ''} DiscussionListItem--unread`;
      }
    });

    extend(CommentPost.prototype, 'elementAttrs', function (attrs) {
      if (!settingEnabled('avocadoFixedAvatarEffect')) return;
      attrs.className = `${attrs.className || ''} CommentPost--fixedAvatar`;
    });

    extend(CommentPost.prototype, 'oncreate', function () {
      queueSyncFixedAvatarBadges(this);
    });

    extend(CommentPost.prototype, 'onupdate', function () {
      queueSyncFixedAvatarBadges(this);
    });

    // ── Share button — always registered, checked on each render ──────────────
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

    // ── Reply icon override ───────────────────────────────────────────────────
    extend(DiscussionControls, 'userControls', function (items) {
      if (!items.has('reply')) return;
      const reply = items.get('reply');
      if (reply && reply.attrs) {
        reply.attrs.icon = 'fa-solid fa-reply';
      }
    });

    // ── Like/Reply action icons — always registered, checked on each render ───
    extend(CommentPost.prototype, 'actionItems', function (items) {
      if (!settingEnabled('avocadoShowActionIcons')) return;
      if (items.has('like')) {
        const post = this.attrs.post;
        const likes = post.likes();
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

    // ── Excerpt in discussion list ─────────────────────────────────────────────
    extend(DiscussionListItem.prototype, 'infoItems', function (items) {
      if (!items.has('excerpt')) {
        const firstPost = this.attrs.discussion.firstPost();
        if (firstPost) {
          const excerpt = truncate(firstPost.contentPlain(), 175);
          items.add('excerpt', <div>{excerpt}</div>, -100);
        }
      }
    });
  },
  -10
);
