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

// Checked at render time — not at boot time
const settingEnabled = (key) => {
  const v = app.forum?.attribute(key);
  return v !== false && v !== '0' && v !== 0 && v !== '' && v !== null;
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

      // Build the full URL — support both uploaded filename and manual full URL
      const heroUrl = /^https?:\/\//.test(heroImage)
        ? heroImage
        : app.forum.attribute('assetsBaseUrl') + '/' + heroImage;

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
        attrs.className += ' DiscussionListItem--unread';
      }
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
            const url = window.location.href;
            const el = e.currentTarget;
            if (navigator.share) {
              navigator.share({ title: post.discussion().title(), url });
            } else {
              navigator.clipboard?.writeText(url).then(() => {
                el.classList.add('avocado-share-done');
                setTimeout(() => el.classList.remove('avocado-share-done'), 2000);
              });
            }
          }}
        >
          <span className="avocado-action-face">
            <i className="avocado-action-icon icon fas fa-share" aria-hidden="true" />
          </span>
          <span className="avocado-action-label">Share</span>
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
