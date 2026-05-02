// @ts-nocheck — large homepage component; shared sub-components are typed individually
import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Tooltip from 'flarum/common/components/Tooltip';
import Avatar from 'flarum/common/components/Avatar';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import abbreviateNumber from 'flarum/common/utils/abbreviateNumber';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import ThreadCard from './shared/ThreadCard';
import {
  trans,
  numberOr,
  safeRoute,
  discussionRoute,
  tagRoute,
  iconColors,
  tagPillStyle,
  displayName,
  formatTimeLabel,
  postPreview,
  resolveAssetUrl,
  FALLBACK_COLORS,
  FALLBACK_ICONS,
  truncate,
  navigate,
  userRoute,
  renderThreadSkeleton,
  renderShowcaseSkeleton,
  renderEmpty,
  getFeaturedTagIds,
  categoryCardStyle,
  safeCssUrl,
} from '../utils';
import { bindRealtime, pushPayloadDiscussion } from '../realtime';

// Module-level cache for real showcase item count (persists across SPA navigations).
let _showcaseRealCount: number | null = null;

// ── Lazy-loaded composer ──────────────────────────────────────────────────────
// Loaded once the first time the user opens the inline composer (or preloaded
// after mount). Keeps the composer's TagPicker + TextEditor toolbar injection
// (~8 KiB) out of the initial parse until it's actually needed.
let _HomeComposer: any = null;

// ─── Hex → "r,g,b" string for inline rgba() in showcase cards ────────────────
const _hexToRgb = (hex) => {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '0,0,0';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
};

// SVG person silhouette — colours driven by var(--primary-color) via CSS classes
const defaultAvatarSvg = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"
    className="Avatar AvocadoDefaultAvatar" aria-hidden="true">
    <circle cx="64" cy="64" r="64" className="AvocadoDefaultAvatar-bg" />
    <circle cx="64" cy="46" r="18" className="AvocadoDefaultAvatar-fg" />
    <path d="M64 70C42 70 24 82 24 96V128H104V96C104 82 86 70 64 70Z"
      className="AvocadoDefaultAvatar-fg" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// HomePage Component
// ─────────────────────────────────────────────────────────────────────────────

export default class HomePage extends Component {
  oninit(vnode) {
    super.oninit(vnode);

    this.searchValue  = '';
    this.likingIds    = new Set();
    this.composerOpen = false;
    this.onlineUsers  = [];

    // FIX: memoization cache — invalidated when store discussion count changes
    this._cachedPopular    = null;
    this._cachedLatest     = null;
    this._cachedStoreSize  = -1;
    this._sectionHasNew    = false;
    this._unbindRealtime   = null;
    this._updatedLikeIds   = new Set();
    this._newDiscIds       = new Set();
    this._selfActionIds    = new Set();

    // Showcase grid state
    this.showcaseItems   = [];
    this.showcaseLoading = false;
    this._showcaseCached = false;
    this._showcaseCache  = {};

    this._homeLoading = true;

    // Preload tags in parallel (for tag names/slugs — does NOT block showcase)
    if (app.tagList?.load) {
      app.tagList.load(['children', 'parent']).catch(() => {});
    }

    this.loadShowcaseDiscussions();
    this.loadOnlineUsers();
    this.loadHomeDiscussions();

    // Preload the composer chunk so it's ready before the user clicks
    if (!_HomeComposer) {
      import('./HomeComposer').then((m) => { _HomeComposer = m.default; }).catch(() => {});
    }
  }

  oncreate(vnode) {
    super.oncreate(vnode);

    // Refetch the discussion the broadcast refers to so firstPost/lastPost/tags
    // are populated for the home cards (the realtime payload only includes the
    // discussion itself).
    const refresh = (discId, { afterRefresh } = {}) => {
      this._cachedPopular = null;
      this._cachedLatest  = null;
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then(() => { afterRefresh?.(); m.redraw(); })
        .catch(() => { m.redraw(); });
    };

    this._unbindRealtime = bindRealtime({
      onPost: (data) => {
        const disc = pushPayloadDiscussion(data);
        const id = disc?.id?.();
        if (!id) return;
        const sid = String(id);
        refresh(id, {
          afterRefresh: () => {
            // Section header dot — broad "something happened in this section".
            this._sectionHasNew = true;
            setTimeout(() => { this._sectionHasNew = false; m.redraw(); }, 5000);
            // Per-thread dot — discreet, fades after the same window.
            this._newDiscIds.add(sid);
            setTimeout(() => { this._newDiscIds.delete(sid); m.redraw(); }, 5000);
          },
        });
      },

      onLike: (data) => {
        const disc = pushPayloadDiscussion(data);
        const id = disc?.id?.();
        if (!id) return;
        const isSelf = this._selfActionIds.has(id);
        if (isSelf) this._selfActionIds.delete(id);
        refresh(id, {
          afterRefresh: () => {
            if (!isSelf) {
              this._updatedLikeIds.add(id);
              setTimeout(() => { this._updatedLikeIds.delete(id); m.redraw(); }, 500);
            }
          },
        });
      },

      onPinned: (data) => {
        const disc = pushPayloadDiscussion(data);
        const id = disc?.id?.();
        if (id) refresh(id);
      },

      onPostRemoved: (data) => {
        const disc = pushPayloadDiscussion(data);
        const id = disc?.id?.();
        if (id) refresh(id);
      },
    });
  }

  onremove(vnode) {
    super.onremove(vnode);
    this._unbindRealtime?.();
    this._unbindRealtime = null;
  }

  allDiscussions() {
    try {
      const pages = app.discussions?.getPages?.();
      if (Array.isArray(pages) && pages.length > 0) {
        const discussions: any[] = [];
        if (typeof pages[0] === 'object' && pages[0] !== null && 'items' in pages[0]) {
          pages.forEach((page: any) => { if (page?.items) discussions.push(...page.items); });
        } else {
          discussions.push(...pages);
        }
        if (discussions.filter(Boolean).length > 0) return discussions.filter(Boolean);
      }
      return app.store.all('discussions').filter(Boolean);
    } catch (e) {
      return app.store.all('discussions').filter(Boolean);
    }
  }

  discussionScore(d) {
    const replyCount = numberOr(d.replyCount?.(), 0);
    const likeCount  = numberOr(d.firstPost?.()?.attribute?.('likesCount'), 0);
    const views      = numberOr(d.attribute?.('viewCount'), 0);
    const lastPostedAt = d.lastPostedAt?.();
    const ageMs      = lastPostedAt ? Date.now() - new Date(lastPostedAt).getTime() : Infinity;
    const agePenalty = Math.max(0, 1 - ageMs / (7 * 24 * 3600 * 1000));
    return replyCount * 2 + likeCount * 3 + views * 0.1 + agePenalty * 20;
  }

  _invalidateIfStoreChanged() {
    const current = app.store.all('discussions').length;
    if (current !== this._cachedStoreSize) {
      this._cachedPopular   = null;
      this._cachedLatest    = null;
      this._cachedStoreSize = current;
    }
  }

  _showcaseTagIds() {
    if (!app.forum?.attribute('avocadoShowcaseEnabled')) return new Set();
    const raw = app.forum?.attribute('avocadoShowcaseTag') || '';
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.map(String).filter(Boolean));
    } catch (_) {}
    const s = String(raw).trim();
    return s ? new Set([s]) : new Set();
  }

  _isShowcaseDiscussion(discussion) {
    const ids = this._showcaseTagIds();
    if (!ids.size) return false;
    return (discussion.tags?.() || []).some((t) => ids.has(String(t?.id?.())));
  }

  popularDiscussions(limit = 5) {
    this._invalidateIfStoreChanged();
    if (this._cachedPopular?.length > 0) return this._cachedPopular;
    const result = [...this.allDiscussions()]
      .filter((d) => !this._isShowcaseDiscussion(d))
      .sort((a, b) => {
        const aSticky = a.isSticky?.() ? 1 : 0;
        const bSticky = b.isSticky?.() ? 1 : 0;
        if (bSticky !== aSticky) return bSticky - aSticky;
        return this.discussionScore(b) - this.discussionScore(a);
      })
      .slice(0, limit);
    if (result.length > 0) this._cachedPopular = result;
    return result;
  }

  latestDiscussions() {
    this._invalidateIfStoreChanged();
    if (this._cachedLatest?.length > 0) return this._cachedLatest;
    const result = [...this.allDiscussions()]
      .sort((a, b) => {
        const aDate = a.lastPostedAt?.() ? new Date(a.lastPostedAt()) : new Date(0);
        const bDate = b.lastPostedAt?.() ? new Date(b.lastPostedAt()) : new Date(0);
        return bDate - aDate;
      })
      .slice(0, 10);
    if (result.length > 0) this._cachedLatest = result;
    return result;
  }

  topCategories(limit = 7) {
    try {
      const tags = app.store.all('tags').filter((t) => t && !t.parent?.());
      return tags
        .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999))
        .slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  openDiscussion(discussion) {
    m.route.set(discussionRoute(discussion));
  }

  toggleLike(discussion) {
    const firstPost = discussion.firstPost?.();
    if (!firstPost) return;
    const id = discussion.id?.();
    if (this.likingIds.has(id)) return;
    const likes   = firstPost.likes?.() || [];
    const isLiked = app.session.user && likes.some((u) => u === app.session.user);
    this.likingIds.add(id);
    this._selfActionIds.add(id);
    m.redraw();
    firstPost.save({ isLiked: !isLiked })
      .then(() => { this.likingIds.delete(id); m.redraw(); })
      .catch(() => { this.likingIds.delete(id); this._selfActionIds.delete(id); m.redraw(); });
  }

  openInlineComposer() {
    if (!app.session.user) {
      app.modal.show(() => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal'));
      return;
    }
    if (this.composerOpen) return;
    this.composerOpen = true;
    m.redraw();
  }

  submitSearch(event) {
    event.preventDefault();
    const q = this.searchValue.trim();
    if (!q) return;
    m.route.set(app.route('avocado-search') + '?q=' + encodeURIComponent(q));
  }

  likesCount(discussion) {
    return numberOr(discussion.firstPost?.()?.attribute?.('likesCount'), 0);
  }

  replyCount(discussion) {
    return numberOr(discussion.replyCount?.(), 0);
  }

  renderAvatar(user, className = '') {
    if (!user) return null;
    return <Avatar user={user} className={className || undefined} title={displayName(user)} />;
  }

  // ── Showcase Grid ────────────────────────────────────────────────────────

  _showcaseFromStore() {
    const ids = this._showcaseTagIds();
    if (!ids.size) return [];
    const limit = Number(app.forum?.attribute('avocadoShowcaseCount') || 5);
    return [...this.allDiscussions()]
      .filter((d) => this._isShowcaseDiscussion(d))
      .sort((a, b) => {
        const aSticky = a.isSticky?.() ? 1 : 0;
        const bSticky = b.isSticky?.() ? 1 : 0;
        if (bSticky !== aSticky) return bSticky - aSticky;
        return new Date(b.createdAt?.()) - new Date(a.createdAt?.());
      })
      .slice(0, limit);
  }

  loadShowcaseDiscussions() {
    if (this._showcaseCached || this.showcaseLoading) return;
    if (!app.forum?.attribute('avocadoShowcaseEnabled')) { this._showcaseCached = true; return; }
    const raw = app.forum?.attribute('avocadoShowcaseTag');
    if (!raw) { this._showcaseCached = true; return; }
    let tagIds = [];
    try {
      const parsed = JSON.parse(raw);
      tagIds = (Array.isArray(parsed) ? parsed : [parsed]).map(String).filter(Boolean);
    } catch (_) {
      const s = String(raw).trim();
      if (s) tagIds = [s];
    }
    if (!tagIds.length) { this._showcaseCached = true; return; }
    this.showcaseLoading = true;
    const expectedCount = Number(app.forum?.attribute('avocadoShowcaseCount') || 5);
    const fromStore = this._showcaseFromStore();
    const storeIsPopulated = this.allDiscussions().length >= 10;
    if (fromStore.length > 0 && (fromStore.length >= expectedCount || storeIsPopulated)) {
      setTimeout(() => {
        this.showcaseItems   = fromStore;
        _showcaseRealCount   = fromStore.length;
        this.showcaseLoading = false;
        this._showcaseCached = true;
        m.redraw();
      }, 350);
      return;
    }
    const resolveSlug = (id) => {
      const allTags = app.store.all('tags') || [];
      const cached  = allTags.find((t) => String(t.id?.()) === id);
      if (cached) return Promise.resolve(cached.slug?.());
      return app.store.find('tags', id)
        .then((tag) => tag?.slug?.() || null)
        .catch(() => null);
    };
    Promise.all(tagIds.map(resolveSlug))
      .then((slugs) => slugs.filter(Boolean))
      .then((slugs) => {
        if (!slugs.length) {
          this.showcaseLoading = false;
          this._showcaseCached = true;
          m.redraw();
          return Promise.resolve([]);
        }
        return Promise.all(slugs.map((slug) => this._fetchShowcaseBySlug(slug)));
      })
      .then((batches) => {
        if (!batches) return;
        if (this._showcaseCached) return;
        const seen  = new Set();
        const limit = Number(app.forum?.attribute('avocadoShowcaseCount') || 5);
        this.showcaseItems = batches
          .flat()
          .filter(Boolean)
          .filter((d) => { const id = d.id?.(); if (!id || seen.has(id)) return false; seen.add(id); return true; })
          .sort((a, b) => new Date(b.createdAt?.()) - new Date(a.createdAt?.()))
          .slice(0, limit);
        _showcaseRealCount   = this.showcaseItems.length;
        this.showcaseLoading = false;
        this._showcaseCached = true;
        m.redraw();
      })
      .catch(() => { this.showcaseLoading = false; this._showcaseCached = true; m.redraw(); });
  }

  _fetchShowcaseBySlug(slug) {
    if (!slug) return Promise.resolve([]);
    if (!this._showcaseCache) this._showcaseCache = {};
    if (this._showcaseCache[slug]) return Promise.resolve(this._showcaseCache[slug]);
    return app.store
      .find('discussions', {
        filter: { tag: slug },
        include: 'user,firstPost,lastPostedUser,lastPost,tags',
        sort: '-createdAt',
        'page[limit]': 5,
      })
      .then((results) => {
        const filtered = Array.isArray(results) ? results.filter(Boolean) : [];
        this._showcaseCache[slug] = filtered;
        return filtered;
      })
      .catch(() => []);
  }

  _extractFirstImage(post) {
    if (!post) return null;
    const html = post.data?.attributes?.contentHtml
      || post.attribute?.('contentHtml')
      || (typeof post.contentHtml === 'function' ? post.contentHtml() : null)
      || '';
    if (html && typeof html === 'string') {
      try {
        const div = document.createElement('div');
        div.innerHTML = html;
        const imgs = div.querySelectorAll('img[src]');
        for (const img of imgs) {
          const src = img.getAttribute('src') || '';
          if (!src || /^javascript:/i.test(src)) continue;
          const w = parseInt(img.getAttribute('width') || '999', 10);
          const h = parseInt(img.getAttribute('height') || '999', 10);
          if (w <= 32 && h <= 32) continue;
          return src;
        }
      } catch (e) {}
    }
    const raw = post.data?.attributes?.content || post.attribute?.('content') || '';
    if (raw && typeof raw === 'string') {
      const mdMatch = raw.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
      if (mdMatch) return mdMatch[1].trim();
      const urlMatch = raw.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#][^\s]*)?/i);
      if (urlMatch) return urlMatch[0];
    }
    return null;
  }

  renderShowcaseCard(discussion, isFirst = false) {
    if (!discussion) return null;
    const id             = discussion.id?.();
    const title          = discussion.title?.() || trans('ramon-avocado.forum.home.untitled', 'Untitled');
    const href           = discussionRoute(discussion);
    const firstPost      = discussion.firstPost?.();
    const isSticky       = discussion.isSticky?.() || false;
    const showcaseTagIds = this._showcaseTagIds();
    const imageStyle     = app.forum?.attribute('avocadoShowcaseImageStyle') || 'default';
    const allTags    = (discussion.tags?.() || []).filter(Boolean);
    const otherTags  = allTags.filter((t) => !showcaseTagIds.has(String(t.id?.())));
    const primaryTag = allTags.find((t) => showcaseTagIds.has(String(t.id?.()))) || allTags[0] || null;
    const tagColor   = primaryTag?.color?.() || null;
    const imageUrl   = this._extractFirstImage(firstPost);
    const excerpt    = postPreview(discussion, 140);
    const noImgBg = tagColor
      ? imageStyle === 'full'
        ? `linear-gradient(135deg,rgba(${_hexToRgb(tagColor)},0.50),rgba(${_hexToRgb(tagColor)},0.30))`
        : `linear-gradient(135deg,rgba(${_hexToRgb(tagColor)},0.18),rgba(${_hexToRgb(tagColor)},0.06))`
      : 'linear-gradient(135deg,var(--avocado-surface-1),var(--control-bg))';
    const rawDate = discussion.createdAt?.();
    const dateStr = formatTimeLabel(rawDate);
    const dateIso = rawDate ? new Date(rawDate).toISOString() : '';
    const user    = discussion.user?.();
    const cardClass = [
      'AvocadoHome-showcaseCard',
      imageStyle === 'full' && 'AvocadoHome-showcaseCard--full',
    ].filter(Boolean).join(' ');
    return (
      <article key={id} className={cardClass} style={tagColor ? { '--card-accent': tagColor } : {}}>
        {isSticky && (
          <div className="AvocadoHome-showcaseCard-badges">
            <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="bottom">
              <span className="AvocadoHome-badge AvocadoHome-badge--sticky"
                    role="img" aria-label={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')}>
                <i className="fas fa-thumbtack" aria-hidden="true" />
              </span>
            </Tooltip>
          </div>
        )}
        {otherTags.length > 0 && (
          <div className="AvocadoHome-showcaseCard-topTags">
            {otherTags.slice(0, 2).map((tag) => {
              const c    = tag.color?.() || null;
              const slug = tag.slug?.();
              const tagHref = slug ? app.route('tag', { tags: slug }) : null;
              return (
                <a key={tag.id?.()}
                   className="AvocadoHome-tagPill"
                   style={c ? { '--tag-bg': '#ffffff', '--tag-color': c } : { '--tag-bg': '#ffffff' }}
                   href={tagHref}
                   onclick={tagHref ? (e) => { e.preventDefault(); e.stopPropagation(); m.route.set(tagHref); } : undefined}>
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name?.()}
                </a>
              );
            })}
          </div>
        )}
        <a className="AvocadoHome-showcaseCard-link" href={href} onclick={(e) => navigate(e, href)}>
          {imageUrl
            ? (isFirst
              ? <img className="AvocadoHome-showcaseCard-img" src={imageUrl} alt={title}
                     width="400" height="150" loading="eager" fetchpriority="high" />
              : <img className="AvocadoHome-showcaseCard-img" alt={title} width="400" height="150"
                     oncreate={(vnode) => {
                       const io = new IntersectionObserver(([entry]) => {
                         if (entry.isIntersecting) { vnode.dom.src = imageUrl; io.disconnect(); }
                       }, { rootMargin: '200px' });
                       io.observe(vnode.dom);
                     }} />
            )
            : <div className="AvocadoHome-showcaseCard-noImg" style={{ background: noImgBg }}>
                {primaryTag?.icon?.() && (
                  <i className={primaryTag.icon()} aria-hidden="true"
                     style={tagColor ? { color: tagColor } : {}} />
                )}
              </div>
          }
          {imageStyle === 'full' && <div className="AvocadoHome-showcaseCard-colorOverlay" />}
          <div className="AvocadoHome-showcaseCard-body">
            {dateStr && (
              <span className="AvocadoHome-showcaseCard-date">
                <time datetime={dateIso}>{dateStr}</time>
              </span>
            )}
            <div className="AvocadoHome-showcaseCard-titleRow">
              <span className="AvocadoHome-showcaseCard-title">{title}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                   fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                   className="AvocadoHome-showcaseCard-arrow" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" className="AvocadoHome-showcaseCard-arrow-line" />
                <polyline points="12 5 19 12 12 19" className="AvocadoHome-showcaseCard-arrow-head" />
              </svg>
            </div>
            {excerpt && <p className="AvocadoHome-showcaseCard-excerpt">{excerpt}</p>}
            {user && (
              <div className="AvocadoHome-showcaseCard-author">
                <Avatar user={user} />
                <span className="AvocadoHome-showcaseCard-authorName">{displayName(user)}</span>
              </div>
            )}
          </div>
        </a>
      </article>
    );
  }

  renderShowcaseSlider() {
    if (!app.forum?.attribute('avocadoShowcaseEnabled')) return null;
    const tagId = app.forum?.attribute('avocadoShowcaseTag');
    if (!tagId) return null;
    const isFollowingPage = app.current.get?.('routeName') === 'following';
    if (isFollowingPage) return null;
    const tag           = app.store.getById('tags', String(tagId));
    const showcaseCount = Math.max(1, Math.min(5, parseInt(app.forum?.attribute('avocadoShowcaseCount')) || 5));
    const items         = [...this.showcaseItems]
      .sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0))
      .slice(0, showcaseCount);
    const tagHref         = tag ? tagRoute(tag) : null;
    const showcaseHeading = app.forum?.attribute('avocadoShowcaseHeading') || tag?.name?.() || trans('ramon-avocado.forum.home.showcase_heading', 'Showcase');
    if (this.showcaseLoading && items.length === 0) {
      const phpCount = parseInt(String(app.forum?.attribute('avocadoShowcaseItemCount') ?? ''), 10);
      const skeletonCount = (phpCount > 0) ? phpCount : (_showcaseRealCount ?? showcaseCount);
      return (
        <section className="AvocadoHome-section AvocadoHome-section--showcase">
          <div className="AvocadoHome-sectionHead">
            <h2>{showcaseHeading}</h2>
            {this.renderOnlineAvatars()}
          </div>
          <div className="AvocadoHome-showcaseGrid">
            {renderShowcaseSkeleton(skeletonCount)}
          </div>
        </section>
      );
    }
    if (!this.showcaseLoading && items.length === 0) return null;
    return (
      <section className="AvocadoHome-section AvocadoHome-section--showcase">
        <div className="AvocadoHome-sectionHead">
          <h2>{showcaseHeading}</h2>
          {this.renderOnlineAvatars()}
        </div>
        <div className="AvocadoHome-showcaseGrid">
          {items.map((d, i) => this.renderShowcaseCard(d, i === 0))}
        </div>
      </section>
    );
  }

  loadHomeDiscussions() {
    const existing = app.store.all('discussions');
    if (existing.length > 0) {
      setTimeout(() => { this._homeLoading = false; m.redraw(); }, 350);
      return;
    }
    this._fetchHomeDiscussions();
  }

  _fetchHomeDiscussions() {
    this._cachedPopular = null;
    this._cachedLatest  = null;
    app.store
      .find('discussions', {
        include: 'user,lastPostedUser,tags,firstPost',
        'page[limit]': 20,
      })
      .then(() => {
        this._homeLoading = false;
        if (this.showcaseLoading && !this._showcaseCached) {
          const fromStore = this._showcaseFromStore();
          if (fromStore.length > 0) {
            this.showcaseItems   = fromStore;
            this.showcaseLoading = false;
            this._showcaseCached = true;
          }
        }
        m.redraw();
      })
      .catch(() => { this._homeLoading = false; m.redraw(); });
  }

  loadOnlineUsers() {
    const win = window as any;
    if (Array.isArray(win.__avocadoOnlineUsers)) {
      this.onlineUsers = win.__avocadoOnlineUsers;
      return;
    }
    const injected = app.forum?.attribute('avocadoOnlineUsers');
    if (Array.isArray(injected)) {
      this.onlineUsers = injected;
      return;
    }
  }

  renderOnlineAvatars() {
    if (!app.forum?.attribute('avocadoShowOnlineUsers')) return null;
    if (!this.onlineUsers.length) return null;
    const MAX_SHOWN = 6;
    const total = this.onlineUsers.length;
    const shown = this.onlineUsers.slice(0, MAX_SHOWN);
    const isPlain = shown[0] && typeof shown[0].username === 'string';
    const GRADIENTS = [
      'linear-gradient(135deg,#ffd166,#f28482)',
      'linear-gradient(135deg,#89cff0,#6b7fc4)',
      'linear-gradient(135deg,#9eea6c,#337d63)',
      'linear-gradient(135deg,#f0b213,#e84393)',
      'linear-gradient(135deg,#c5ccff,#b5e3ff)',
      'linear-gradient(135deg,#ffb5a7,#fcd5ce)',
    ];
    return (
      <div className="AvocadoHome-onlineAvatars">
        <div className="AvocadoHome-onlineAvatars-row">
          {shown.map((user, i) => {
            const key        = isPlain ? user.id : user.id?.();
            const userModel  = isPlain ? (key ? app.store.getById('users', String(key)) : null) : user;
            const username   = userModel?.username?.() || (isPlain ? user.username : '');
            const name       = userModel?.displayName?.() || userModel?.username?.() || (isPlain ? (user.displayName || user.username) : displayName(user));
            const avatarUrl  = userModel?.avatarUrl?.() || (isPlain ? (user.avatarUrl || null) : null);
            const profileHref = safeRoute('user', { username });
            const fallbackBg = GRADIENTS[i % GRADIENTS.length];
            return (
              <a key={key} className="AvocadoHome-onlineAvatars-item"
                 href={profileHref}
                 onclick={(e) => { e.stopPropagation(); navigate(e, profileHref); }}
                 title={name}
                 style={avatarUrl ? {} : { background: fallbackBg }}
              >
                {avatarUrl && (
                  <img src={avatarUrl} alt={name} className="Avatar" width="28" height="28" decoding="async" />
                )}
              </a>
            );
          })}
        </div>
        {app.forum?.attribute('avocadoShowOnlineCount') !== false && (
          <span className="AvocadoHome-onlineAvatars-count">{total} online</span>
        )}
      </div>
    );
  }

  renderNavBar() {
    let itemList;
    try {
      itemList = IndexSidebar.prototype.navItems.call({});
    } catch (_) {
      return null;
    }
    itemList.remove('tags');
    itemList.remove('popularHome');
    itemList.remove('allDiscussions');
    const items = itemList.toArray().filter((item) => {
      if (!item) return false;
      if (typeof item.tag === 'string') return false;
      if (item.attrs && 'model' in item.attrs) return false;
      const href = item.attrs?.href || '';
      if (/\/t\//.test(href)) return false;
      if (/\/tags$/.test(href)) return false;
      const label = item.children?.[0]?.children?.[0]?.children || '';
      if (typeof label === 'string' && label.toLowerCase().includes('more')) return false;
      return true;
    });
    if (!items.length) return null;
    return (
      <nav className="AvocadoHomeNav" aria-label="Navigation">
        {items}
      </nav>
    );
  }

  view() {
    const user      = app.session.user;
    const heroImage = app.forum?.attribute('avocadoHeroImage');
    const heroUrl   = heroImage ? resolveAssetUrl(heroImage) : null;
    const heroImagePosition = app.forum?.attribute('avocadoHeroImagePosition') || 'center top';
    const forumTitle = app.forum?.attribute('welcomeTitle') || app.forum?.attribute('title') || '';
    const forumDesc  = app.forum?.attribute('welcomeMessage') || app.forum?.attribute('description') || '';
    const isFollowingPage = app.current.get?.('routeName') === 'following';
    const popular = this._homeLoading
      ? []
      : (isFollowingPage ? this.allDiscussions().slice(0, 5) : this.popularDiscussions(5));
    const featuredIds = getFeaturedTagIds();
    const categories  = this.topCategories(7).sort((a, b) => {
      const aF = featuredIds.has(String(a.id?.()));
      const bF = featuredIds.has(String(b.id?.()));
      if (aF === bF) return 0;
      return aF ? -1 : 1;
    });
    const allTagsCount     = app.store.all('tags').filter((t) => t && !t.parent?.()).length;
    const extraCategories  = Math.max(0, allTagsCount - categories.length);
    const guestCTA = (
      <div className="AvocadoHome-guestCTA">
        <div className="AvocadoHome-guestCTA-actions">
          <button
            className="AvocadoHome-guestCTA-btn AvocadoHome-guestCTA-btn--login"
            onclick={() => app.modal.show(() => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal'))}
          >
            <i className="fas fa-sign-in-alt" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.log_in', 'Log In')}
          </button>
          <span className="AvocadoHome-guestCTA-or">{trans('ramon-avocado.forum.home.or', 'or')}</span>
          <button
            className="AvocadoHome-guestCTA-btn AvocadoHome-guestCTA-btn--signup"
            onclick={() => app.modal.show(() => flarum.reg.asyncModuleImport('flarum/forum/components/SignUpModal'))}
          >
            <i className="fas fa-user-plus" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.sign_up', 'Sign Up')}
          </button>
        </div>
      </div>
    );

    // Resolve the lazy-loaded composer component at render time
    const HC = _HomeComposer;

    return (
      <div className="AvocadoHome">
        <div className="AvocadoHome-wrapper">
          <div className="AvocadoHome-main">

          {/* ── Hero banner (guests only) ─────────────────────────────── */}
          {!user && (
            <div
              className={`AvocadoHome-heroBanner${heroUrl ? ' AvocadoHome-heroBanner--hasImage' : ''}`}
              style={heroUrl ? {
                backgroundImage: safeCssUrl(heroUrl),
                backgroundSize: 'cover',
                backgroundPosition: heroImagePosition,
              } : {}}
            >
              <div className="AvocadoHome-heroBannerOverlay">
                <div className="AvocadoHome-heroBannerContent">
                  <div className="AvocadoHome-heroBannerIcon">
                    <i className="fas fa-comments" aria-hidden="true" />
                  </div>
                  <h1 className="AvocadoHome-heroBannerTitle">{forumTitle}</h1>
                  {forumDesc && <p className="AvocadoHome-heroBannerDesc">{forumDesc}</p>}
                  {app.forum?.attribute('avocadoShowGuestCta') !== false && guestCTA}
                </div>
              </div>
            </div>
          )}

          {/* ── Post input trigger ────────────────────────────────────── */}
          {user && !this.composerOpen && (
            <div className="AvocadoHome-postInput" onclick={this.openInlineComposer.bind(this)}>
              <div className="AvocadoHome-postInput-inner">
                {this.renderAvatar(user, 'AvocadoHome-postInput-avatar')}
                <span className="AvocadoHome-postInput-placeholder">
                  {trans('ramon-avocado.forum.home.start_discussion', 'Tell everyone what are you working on...')}
                </span>
                <button
                  className="AvocadoHome-postInput-newBtn"
                  type="button"
                  onclick={(e) => { e.stopPropagation(); this.openInlineComposer(); }}
                >
                  <i className="fas fa-plus" aria-hidden="true" />
                  {trans('ramon-avocado.forum.home.new_discussion', 'New discussion')}
                </button>
              </div>
            </div>
          )}

          {/* ── Inline composer (lazy-loaded) ─────────────────────────── */}
          {this.composerOpen && HC && (
            <HC
              user={user}
              onClose={() => { this.composerOpen = false; m.redraw(); }}
            />
          )}

          {/* ── Categories section ────────────────────────────────────── */}
          {categories.length > 0 && !isFollowingPage && (
            <section className="AvocadoHome-section AvocadoHome-section--categories">
              <div className="AvocadoHome-sectionHead">
                <h2>{trans('ramon-avocado.forum.home.categories_heading', 'Categories')}</h2>
                {(() => {
                  const nav = this.renderNavBar();
                  if (!nav) return null;
                  const inlineNav = { ...nav, attrs: { ...nav.attrs, className: (nav.attrs?.className || '') + ' AvocadoHomeNav--inline' } };
                  return (
                    <div className="AvocadoHome-sectionHead-nav">{inlineNav}</div>
                  );
                })()}
              </div>
              <div className="AvocadoHome-categories">
                {[
                  ...categories.map((cat, idx) => {
                    const catColor   = cat.color?.() || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
                    const catIcon    = cat.icon?.() || FALLBACK_ICONS[idx % FALLBACK_ICONS.length];
                    const catRoute   = tagRoute(cat);
                    const count      = numberOr(cat.discussionCount?.(), 0);
                    const isFeatured = featuredIds.has(String(cat.id?.()));
                    return (
                      <a
                        key={cat.id?.()}
                        className={`AvocadoHome-categoryCard${isFeatured ? ' AvocadoHome-categoryCard--featured' : ''}`}
                        href={catRoute}
                        onclick={(e) => navigate(e, catRoute)}
                        style={categoryCardStyle(catColor)}
                      >
                        {isFeatured && (
                          <Tooltip text={trans('ramon-avocado.forum.tags.featured', 'Featured')} position="top">
                            <span className="AvocadoHome-featuredBadge">
                              <img src={resolveAssetUrl('fire.webp')} alt="" aria-hidden="true" width="18" height="18" />
                            </span>
                          </Tooltip>
                        )}
                        <span className="AvocadoHome-categoryIcon">
                          <i className={catIcon} aria-hidden="true" />
                        </span>
                        <div className="AvocadoHome-categoryBody">
                          <h3>{cat.name?.()}</h3>
                          <p>{abbreviateNumber(numberOr(count, 0))} {count === 1 ? trans('ramon-avocado.forum.home.discussion_singular', 'discussion') : trans('ramon-avocado.forum.home.discussions', 'discussions')}</p>
                        </div>
                      </a>
                    );
                  }),
                  <a
                    key="--all"
                    className="AvocadoHome-categoryCard AvocadoHome-categoryCard--all"
                    href={safeRoute('tags')}
                    onclick={(e) => navigate(e, safeRoute('tags'))}
                  >
                    <div className="AvocadoHome-categoryBody">
                      <h3>{trans('ramon-avocado.forum.home.all_categories', 'All categories')}</h3>
                      <p>{extraCategories} {trans('ramon-avocado.forum.home.more', 'more')}</p>
                    </div>
                    <i className="fas fa-arrow-right" aria-hidden="true" />
                  </a>,
                ]}
              </div>
            </section>
          )}

          {/* ── Showcase Slider ──────────────────────────────────────────── */}
          {this.renderShowcaseSlider()}

          {/* ── Popular / Following discussions ───────────────────────────── */}
          <section className="AvocadoHome-section">
            <div className="AvocadoHome-sectionHead">
              <h2>{isFollowingPage
                ? trans('ramon-avocado.forum.home.following_heading', 'Following')
                : trans('ramon-avocado.forum.home.popular_heading', 'Popular discussions')
              }</h2>
              <div className="AvocadoHome-sectionHead-right">
                {this._sectionHasNew && <span className="AvocadoStatDot AvocadoHome-sectionDot" aria-hidden="true" />}
                {!app.forum?.attribute('avocadoShowcaseEnabled') && this.renderOnlineAvatars()}
                <a
                  className="AvocadoHome-seeAll"
                  href={safeRoute('avocado-discussions')}
                  onclick={(e) => navigate(e, safeRoute('avocado-discussions'))}
                >
                  {trans('ramon-avocado.forum.home.see_all', 'See all')}{' '}
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="AvocadoHome-threadStack">
              {popular.length === 0 && this._homeLoading
                ? renderThreadSkeleton(5)
                : popular.length === 0
                  ? renderEmpty(trans('ramon-avocado.forum.home.popular_no_discussions', 'No discussions yet.'))
                  : popular.map((d) => (
                    <ThreadCard
                      key={d.id?.()}
                      discussion={d}
                      context={this}
                      likingIds={this.likingIds}
                      updatedLikeIds={this._updatedLikeIds}
                      newDiscIds={this._newDiscIds}
                      onToggleLike={(disc) => this.toggleLike(disc)}
                      filterTagIds={this._showcaseTagIds()}
                    />
                  ))
              }
            </div>
          </section>

          </div>
        </div>
      </div>
    );
  }
}
