import { extend, override } from 'flarum/common/extend';
import DiscussionListItem from 'flarum/forum/components/DiscussionListItem';
import DiscussionListState from 'flarum/forum/states/DiscussionListState';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import Search from 'flarum/forum/components/Search';
import HeaderSecondary from 'flarum/forum/components/HeaderSecondary';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import IndexPage from 'flarum/forum/components/IndexPage';
import CommentPost from 'flarum/forum/components/CommentPost';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import WelcomeHero from 'flarum/forum/components/WelcomeHero';
import TagsPage from 'ext:flarum/tags/forum/components/TagsPage';
import UserCard from 'flarum/forum/components/UserCard';
import UserPage from 'flarum/forum/components/UserPage';
import DiscussionHero from 'flarum/forum/components/DiscussionHero';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import Tooltip from 'flarum/common/components/Tooltip';
import AvocadoTagsPage from './components/TagsPage';
import HomePage from './components/HomePage';
import { truncate } from 'flarum/common/utils/string';

// PHP side uses boolval in serializeToForum, so values arrive as true/false/null.
const settingEnabled = (key, defaultValue = true) => {
  const val = app.forum?.attribute(key);
  if (val === null || val === undefined) return defaultValue;
  return !!val;
};

const hasIndexFilters = () => {
  // 'sort' is intentionally excluded so /?sort=latest still shows the custom home.
  return ['q', 'tags', 'page'].some((name) => {
    const value = m.route.param(name);
    return value !== null && value !== undefined && String(value).length > 0;
  });
};

const customHomeEnabled = () => {
  return settingEnabled('avocadoHomeEnabled', false) && !hasIndexFilters();
};

const setClassName = (vdom, className, enabled) => {
  if (!vdom?.attrs) return;

  const current = typeof vdom.attrs.className === 'string' ? vdom.attrs.className : '';
  const classes = current.split(/\s+/).filter(Boolean);
  const hasClass = classes.includes(className);

  if (enabled && !hasClass) {
    classes.push(className);
  }

  if (!enabled && hasClass) {
    vdom.attrs.className = classes.filter((name) => name !== className).join(' ');
    return;
  }

  vdom.attrs.className = classes.join(' ');
};

const trans = (key, fallback, params) => {
  const out = app.translator?.trans(key, params);
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

const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
  const hasBadges = badges.querySelector('li') !== null;
  const shouldInlineInHeader = settingEnabled('avocadoFixedAvatarEffect')
    && root.classList?.contains('CommentPost--fixedAvatar')
    && isDesktop
    && hasBadges;

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

// Resolve the current tag from the route (e.g. /t/azul → tag "azul").
const getCurrentTag = () => {
  const tagSlug = m.route.param('tags');
  if (!tagSlug) return null;
  return app.store.getBy('tags', 'slug', tagSlug) || null;
};

app.initializers.add(
  'ramon-avocado',
  () => {
    // ── 1. Theme class on <html> ──────────────────────────────────────────────
    if (settingEnabled('avocadoHomeEnabled', false)) {
      document.documentElement.classList.add('avocado-theme');
    }

    // ── 2. UserCard stats row ─────────────────────────────────────────────────
    extend(UserCard.prototype, 'contentItems', function (items) {
      const user = this.attrs.user;
      if (!user) return;
      const discussions = user.discussionCount?.() ?? 0;
      const comments = user.commentCount?.() ?? 0;
      items.add(
        'avocadoStats',
        <div className="AvocadoUserCard-stats">
          <div className="AvocadoUserCard-stat">
            <strong>{discussions}</strong>
            <span>{trans('ramon-avocado.forum.user.discussions', 'Discussions')}</span>
          </div>
          <div className="AvocadoUserCard-stat">
            <strong>{comments}</strong>
            <span>{trans('ramon-avocado.forum.user.comments', 'Comments')}</span>
          </div>
        </div>,
        -10
      );
    });

    // ── 3. UserPage loading class ─────────────────────────────────────────────
    extend(UserPage.prototype, 'view', function (vdom) {
      if (!this.user && vdom?.attrs) {
        vdom.attrs.className = ((vdom.attrs.className || '') + ' UserPage--loading').trim();
      }
    });

    // ── 4. DiscussionHero: custom hero with back button, tag pills, title, participants ──
    override(DiscussionHero.prototype, 'view', function (original, vnode) {
      const discussion = this.attrs.discussion;
      if (!discussion) return original(vnode);

      const tags = (discussion.tags?.() || []).filter(Boolean);
      const firstTag = tags[0] || null;
      const color = firstTag?.color?.() || 'var(--primary-color)';
      const title = discussion.title?.() || '';
      const replyCount = discussion.replyCount?.() || 0;
      const postCount = replyCount + 1;

      // Collect unique participants
      const participantMap = new Map();
      const author = discussion.user?.();
      if (author) {
        const id = author.id?.();
        if (id) participantMap.set(id, author);
      }
      const lastPoster = discussion.lastPostedUser?.();
      if (lastPoster) {
        const id = lastPoster.id?.();
        if (id && !participantMap.has(id)) participantMap.set(id, lastPoster);
      }
      try {
        app.store.all('posts').forEach((post) => {
          const disc = post.discussion?.();
          if (disc && disc.id?.() === discussion.id?.()) {
            const user = post.user?.();
            if (user) {
              const id = user.id?.();
              if (id && !participantMap.has(id)) participantMap.set(id, user);
            }
          }
        });
      } catch (e) {}
      const participants = Array.from(participantMap.values());

      const renderParticipantAvatar = (user) => {
        if (!user) return null;
        const avatarUrl = user.avatarUrl?.();
        const username = user.username?.();
        const initials = username ? username.substring(0, 2).toUpperCase() : '??';
        return avatarUrl
          ? m('img.DiscussionHero-participantAvatar', {
              key: user.id?.(),
              src: avatarUrl,
              alt: username,
              title: username,
            })
          : m(
              'div.DiscussionHero-participantFallback',
              { key: user.id?.(), title: username },
              initials
            );
      };

      return (
        <header className="DiscussionHero" style={{ '--discussion-color': color }}>
          <div className="container">
            <div className="DiscussionHero-nav">
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
              {tags.slice(0, 3).map((tag) => (
                <span key={tag.id()} className="DiscussionHero-tagPill">
                  {tag.icon() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name()}
                </span>
              ))}
            </div>
            <h1 className="DiscussionHero-title">{title}</h1>
            <div className="DiscussionHero-meta">
              {participants.length > 0 && (
                <div className="DiscussionHero-participants">
                  {participants.map(renderParticipantAvatar)}
                </div>
              )}
              <span className="DiscussionHero-metaItem">
                <i className="far fa-comment" aria-hidden="true" />
                {postCount} {postCount === 1 ? 'post' : 'posts'}
              </span>
            </div>
          </div>
        </header>
      );
    });

    // ── 5. DiscussionPage skeleton override ───────────────────────────────────
    override(DiscussionPage.prototype, 'view', function (original, vnode) {
      if (this.discussion) return original(vnode);

      return (
        <div className="Page DiscussionPage DiscussionPage--skeleton">
          <div className="Page-main">
            <div className="AvocadoSkeleton-discussionHero">
              <div className="container">
                <div className="AvocadoSkeleton-tag" />
                <div className="AvocadoSkeleton-title" />
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

    // ── 6. Auth modal panel injection via MutationObserver ────────────────────
    const injectAuthModalPanels = (modalEl) => {
      if (!modalEl) return;
      if (modalEl.querySelector('.AvocadoAuth-panel')) return;

      const authImage = app.forum?.attribute('avocadoAuthImage');
      const heroImage = app.forum?.attribute('avocadoHeroImage');
      const rawUrl = authImage || heroImage || null;
      const heroUrl = rawUrl ? resolveAssetUrl(rawUrl) : null;
      const forumTitle = app.forum?.attribute('title') || '';
      const forumDesc = app.forum?.attribute('description') || '';

      const panel = document.createElement('div');
      panel.className = 'AvocadoAuth-panel';
      if (heroUrl) {
        panel.style.backgroundImage = `url(${heroUrl})`;
        panel.style.backgroundSize = 'cover';
        panel.style.backgroundPosition = 'center top';
      }

      const overlay = document.createElement('div');
      overlay.className = 'AvocadoAuth-panelOverlay';

      const content = document.createElement('div');
      content.className = 'AvocadoAuth-panelContent';
      content.innerHTML = `<strong class="AvocadoAuth-panelTitle">${forumTitle}</strong>${forumDesc ? `<p class="AvocadoAuth-panelDesc">${forumDesc}</p>` : ''}`;

      panel.appendChild(overlay);
      panel.appendChild(content);
      modalEl.insertBefore(panel, modalEl.firstChild);
    };

    const authObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const modal = node.querySelector?.('.Modal-content') || (node.classList?.contains('Modal-content') ? node : null);
          if (modal) injectAuthModalPanels(modal);
        });
      });
    });

    authObserver.observe(document.body, { childList: true, subtree: true });

    // ── 7. HeaderSecondary auth buttons for guest users ───────────────────────
    extend(HeaderSecondary.prototype, 'items', function (items) {
      if (app.session.user) return;
      if (!settingEnabled('avocadoShowAuthButtons', false)) return;

      items.add(
        'avocado-login',
        <button
          className="Button Button--link AvocadoHeader-authBtn AvocadoHeader-authBtn--login"
          onclick={() => app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default))}
        >
          {trans('ramon-avocado.forum.header.log_in', 'Log In')}
        </button>,
        10
      );

      items.add(
        'avocado-signup',
        <button
          className="Button Button--primary AvocadoHeader-authBtn AvocadoHeader-authBtn--signup"
          onclick={() => app.modal.show(() => import('flarum/forum/components/SignUpModal').then((m) => m.default))}
        >
          {trans('ramon-avocado.forum.header.sign_up', 'Sign Up')}
        </button>,
        9
      );
    });

    // ── 8. DiscussionListState requestParams (include first/last post) ─────────
    extend(DiscussionListState.prototype, 'requestParams', function (params) {
      params.include = params.include || [];
      const include = Array.isArray(params.include) ? params.include : String(params.include).split(',');
      const toAdd = ['firstPost', 'lastPostedUser', 'lastPost', 'lastPost.user'];
      toAdd.forEach((rel) => {
        if (!include.includes(rel)) include.push(rel);
      });
      params.include = include;
    });

    // ── 9. IndexPage contentItems: swap to HomePage when avocadoHomeEnabled ───
    extend(IndexPage.prototype, 'contentItems', function (items) {
      if (!customHomeEnabled()) return;
      if (items.has('discussionList')) {
        items.remove('discussionList');
      }
      items.add('avocadoHome', <HomePage />, 100);
    });

    // ── 10. IndexPage view: setClassName for avocadoHome and avocadoTag ────────
    extend(IndexPage.prototype, 'view', function (vdom) {
      if (!vdom) return;
      setClassName(vdom, 'IndexPage--avocadoHome', customHomeEnabled());
      const currentTag = getCurrentTag();
      setClassName(vdom, 'IndexPage--avocadoTag', !!currentTag);
    });

    // ── 11. IndexPage hero override: custom tag hero on /t/slug ───────────────
    override(IndexPage.prototype, 'hero', function (original) {
      const currentTag = getCurrentTag();
      if (!currentTag) return original();

      const tagColor = currentTag.color?.() || 'var(--primary-color)';
      const tagIcon = currentTag.icon?.();
      const tagName = currentTag.name?.() || '';
      const tagDesc = currentTag.description?.() || '';
      const discussionCount = currentTag.discussionCount?.() ?? 0;

      return (
        <header className="AvocadoTagHero" style={{ '--tag-color': tagColor }}>
          <div className="container">
            <div className="AvocadoTagHero-inner">
              {tagIcon && (
                <span className="AvocadoTagHero-icon">
                  <i className={tagIcon} aria-hidden="true" />
                </span>
              )}
              <div className="AvocadoTagHero-text">
                <h1 className="AvocadoTagHero-title">{tagName}</h1>
                {tagDesc && <p className="AvocadoTagHero-desc">{tagDesc}</p>}
              </div>
              <span className="AvocadoTagHero-count">
                {discussionCount} {discussionCount === 1
                  ? trans('ramon-avocado.forum.tag.discussion_singular', 'discussion')
                  : trans('ramon-avocado.forum.tag.discussion_plural', 'discussions')}
              </span>
            </div>
          </div>
        </header>
      );
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
      if (items.has('loading')) {
        items.remove('loading');
      }
    });

    // ── 13. WelcomeHero isHidden + view overrides ──────────────────────────────
    override(WelcomeHero.prototype, 'isHidden', function (original) {
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

      const result = original(vnode);

      if (result && result.attrs) {
        result.attrs.className = (result.attrs.className || '') + ' Hero--banner';
        const kids = Array.isArray(result.children)
          ? result.children
          : result.children != null ? [result.children] : [];
        result.children = [imgEl, ...kids];
        return result;
      }

      return <header className="Hero WelcomeHero Hero--banner">{imgEl}</header>;
    });

    // ── 14. TagsPage override ─────────────────────────────────────────────────
    override(TagsPage.prototype, 'tagTileListView', AvocadoTagsPage.prototype.tagTileListView);
    override(TagsPage.prototype, 'tagTileView', AvocadoTagsPage.prototype.tagTileView);
    override(TagsPage.prototype, 'cloudView', AvocadoTagsPage.prototype.cloudView);

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
      if (this.attrs.discussion.tags()?.[0]?.color()) {
        attrs.style = { '--tag-color': this.attrs.discussion.tags()[0].color(), ...(attrs.style || {}) };
      }
      if (this.attrs.discussion.isUnread()) {
        attrs.className = `${attrs.className || ''} DiscussionListItem--unread`;
      }
    });

    // ── 18. CommentPost elementAttrs (fixedAvatar class) ──────────────────────
    extend(CommentPost.prototype, 'elementAttrs', function (attrs) {
      if (!settingEnabled('avocadoFixedAvatarEffect')) return;
      attrs.className = `${attrs.className || ''} CommentPost--fixedAvatar`;
    });

    // ── 19. CommentPost oncreate/onupdate (queueSyncFixedAvatarBadges) ─────────
    extend(CommentPost.prototype, 'oncreate', function () {
      queueSyncFixedAvatarBadges(this);
    });

    extend(CommentPost.prototype, 'onupdate', function () {
      queueSyncFixedAvatarBadges(this);
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

    // ── 23. DiscussionListItem infoItems (excerpt) ────────────────────────────
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
