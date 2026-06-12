import app from 'flarum/forum/app';
import extractText from 'flarum/common/utils/extractText';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import Tooltip from 'flarum/common/components/Tooltip';
import Avatar from 'flarum/common/components/Avatar';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import abbreviateNumber from 'flarum/common/utils/abbreviateNumber';

import {
  trans,
  numberOr,
  safeRoute,
  discussionRoute,
  tagRoute,
  displayName,
  formatTimeLabel,
  postPreview,
  resolveAssetUrl,
  FALLBACK_COLORS,
  FALLBACK_ICONS,
  navigate,
  renderThreadSkeleton,
  renderShowcaseSkeleton,
  renderEmpty,
  getFeaturedTagIds,
  getDiscussionHeroImageUrl,
  categoryCardStyle,
  safeCssUrl,
  sanitizeAdminHtml,
} from '../utils';
import { toggleDiscussionLike } from '../utils/likes';
import { bindDiscussionFeedRealtime } from '../utils/discussionRealtime';

import HomeState from '../states/HomeState';

import ThreadCard from './shared/ThreadCard';
import OnlineUsers from './shared/OnlineUsers';
import InlineComposer from './shared/InlineComposer';

/** Hex → "r,g,b" string, used by inline rgba() styles in showcase cards. */
const hexToRgbTriplet = (hex: string | null | undefined): string => {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '0,0,0';
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
};

/**
 * HomePage — the Avocado home dashboard.
 *
 * Layout:
 *  1. Hero banner (guests only).
 *  2. Inline composer trigger + composer.
 *  3. Categories grid (top-level tags).
 *  4. Showcase slider (configurable tag-based highlight).
 *  5. Popular / Following thread stack.
 *
 * Data lives in `HomeState` (popular/latest/showcase, fetch + cache);
 * the page itself only reads from it and renders.
 */
export default class HomePage extends Component<ComponentAttrs, HomeState> {
  state!: HomeState;

  // Per-card transient UI state — kept on the page rather than in HomeState
  // because they're driven by user interactions and realtime echoes.
  private likingIds = new Set<string>();
  private composerOpen = false;
  private updatedLikeIds = new Set<string>();
  private newDiscIds = new Set<string>();
  private selfActionIds = new Set<string>();
  private sectionHasNew = false;

  private unbindRealtime: (() => void) | null = null;

  oninit(vnode: any) {
    super.oninit(vnode);

    this.state = new HomeState();

    // Preload tags in parallel — does NOT block the showcase fetch.
    if (app.tagList?.load) app.tagList.load(['children', 'parent']).catch(() => {});

    this.state.loadShowcase();
    this.state.loadHome();
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);

    this.unbindRealtime = bindDiscussionFeedRealtime({
      selfActionIds: this.selfActionIds,
      updatedLikeIds: this.updatedLikeIds,
      currentItems: () => this.state.allDiscussions(),
      onHydrated: (disc: any, kind: string) => {
        const id = disc?.id?.();
        if (!id) return;
        const sid = String(id);

        // Drop memoized popular/latest so the next render reflects the change.
        this.state.invalidate();

        if (kind === 'post') {
          // Section-level highlight ("something happened in this section").
          this.sectionHasNew = true;
          setTimeout(() => {
            this.sectionHasNew = false;
            m.redraw();
          }, 5000);
          // Per-thread highlight, fades on the same window.
          this.newDiscIds.add(sid);
          setTimeout(() => {
            this.newDiscIds.delete(sid);
            m.redraw();
          }, 5000);
        }
      },
    });
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    this.unbindRealtime?.();
    this.unbindRealtime = null;
  }

  // ── Composer ────────────────────────────────────────────────────────────────

  private openComposer() {
    if (!app.session.user) {
      app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));
      return;
    }
    if (this.composerOpen) return;
    this.composerOpen = true;
    m.redraw();
  }

  // ── View ────────────────────────────────────────────────────────────────────

  view() {
    const user = app.session.user;
    const isFollowingPage = app.current.get?.('routeName') === 'following';

    const popular = this.state.homeLoading ? [] : isFollowingPage ? this.state.allDiscussions().slice(0, 5) : this.state.popularDiscussions(5);

    return (
      <div className="AvocadoHome">
        <div className="AvocadoHome-wrapper">
          <div className="AvocadoHome-main">
            {!user && this.renderHeroBanner()}
            {user && !this.composerOpen && this.renderComposerTrigger(user)}
            {this.composerOpen && (
              <InlineComposer
                user={user}
                onClose={() => {
                  this.composerOpen = false;
                  m.redraw();
                }}
                onSubmitted={(disc: any) => m.route.set(app.route.discussion(disc))}
              />
            )}

            {!isFollowingPage && this.renderCategoriesSection()}
            {this.renderShowcaseSlider()}
            {this.renderPopularSection(popular, isFollowingPage)}
          </div>
        </div>
      </div>
    );
  }

  // ── Hero banner (guests) ────────────────────────────────────────────────────

  private renderHeroBanner() {
    const heroImage = app.forum?.attribute<string>('avocadoHeroImage');
    const heroUrl = heroImage ? resolveAssetUrl(heroImage) : null;
    const heroImagePosition = app.forum?.attribute<string>('avocadoHeroImagePosition') || 'center top';
    const forumTitle = app.forum?.attribute<string>('welcomeTitle') || app.forum?.attribute<string>('title') || '';
    const forumDesc = app.forum?.attribute<string>('welcomeMessage') || app.forum?.attribute<string>('description') || '';

    const customEnabled = !!app.forum?.attribute('avocadoCustomHeroEnabled');
    const customHtml = sanitizeAdminHtml(app.forum?.attribute('avocadoCustomHeroHtml') as string);

    // Custom HTML replaces everything inside the overlay — the admin's markup
    // becomes a direct child of .AvocadoHome-heroBannerOverlay so it can define
    // its own .AvocadoHome-heroBannerContent (and anything else) without being
    // nested inside an extra wrapper. The hero banner wrapper, background image
    // and overlay still stay so all hero settings keep working. Admin-pasted
    // HTML follows Flarum's "admin == HTML" convention but is scrubbed via
    // sanitizeAdminHtml to keep an admin-account compromise from becoming
    // guest-visible XSS.
    const innerContent =
      customEnabled && customHtml ? (
        m.trust(customHtml) /* admin-HTML já passado pelo sanitizeAdminHtml acima; nosemgrep: flarum-v2-m-trust */
      ) : (
        <div className="AvocadoHome-heroBannerContent">
          <div className="AvocadoHome-heroBannerIcon">
            <i className="fas fa-comments" aria-hidden="true" />
          </div>
          <h1 className="AvocadoHome-heroBannerTitle">{forumTitle}</h1>
          {forumDesc && (
            <p className="AvocadoHome-heroBannerDesc">
              {m.trust(sanitizeAdminHtml(forumDesc)) /* atributo de admin com o mesmo scrub do hero; nosemgrep: flarum-v2-m-trust */}
            </p>
          )}
          {app.forum?.attribute('avocadoShowGuestCta') !== false && this.renderGuestCTA()}
        </div>
      );

    const useCustom = customEnabled && !!customHtml;
    const bannerClasses =
      `AvocadoHome-heroBanner` + (heroUrl ? ' AvocadoHome-heroBanner--hasImage' : '') + (useCustom ? ' AvocadoHome-heroBanner--customHtml' : '');

    return (
      <div
        className={bannerClasses}
        style={
          heroUrl
            ? {
                backgroundImage: safeCssUrl(heroUrl),
                backgroundSize: 'cover',
                backgroundPosition: heroImagePosition,
              }
            : {}
        }
      >
        <div className="AvocadoHome-heroBannerOverlay">{innerContent}</div>
      </div>
    );
  }

  private renderGuestCTA() {
    return (
      <div className="AvocadoHome-guestCTA">
        <div className="AvocadoHome-guestCTA-actions">
          <button
            className="AvocadoHome-guestCTA-btn AvocadoHome-guestCTA-btn--login"
            onclick={() => app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'))}
          >
            <i className="fas fa-sign-in-alt" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.log_in', 'Log In')}
          </button>
          <span className="AvocadoHome-guestCTA-or">{trans('ramon-avocado.forum.home.or', 'or')}</span>
          <button
            className="AvocadoHome-guestCTA-btn AvocadoHome-guestCTA-btn--signup"
            onclick={() => app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/SignUpModal'))}
          >
            <i className="fas fa-user-plus" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.sign_up', 'Sign Up')}
          </button>
        </div>
      </div>
    );
  }

  // ── Composer trigger ────────────────────────────────────────────────────────

  private renderComposerTrigger(user: any) {
    return (
      <div className="AvocadoHome-postInput" onclick={() => this.openComposer()}>
        <div className="AvocadoHome-postInput-inner">
          {user && <Avatar user={user} className="AvocadoHome-postInput-avatar" title={displayName(user)} />}
          <span className="AvocadoHome-postInput-placeholder">
            {trans('ramon-avocado.forum.home.start_discussion', 'Tell everyone what are you working on...')}
          </span>
          <button
            className="AvocadoHome-postInput-newBtn"
            type="button"
            onclick={(e: Event) => {
              e.stopPropagation();
              this.openComposer();
            }}
          >
            <i className="fas fa-plus" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.new_discussion', 'New discussion')}
          </button>
        </div>
      </div>
    );
  }

  // ── Categories section ──────────────────────────────────────────────────────

  private renderCategoriesSection() {
    const categories = this.sortedCategories();
    if (categories.length === 0) return null;

    const heading =
      (app.forum?.attribute('avocadoCategoriesHeading') as string)?.trim() || trans('ramon-avocado.forum.home.categories_heading', 'Categories');
    const allTagsCount = app.store.all('tags').filter((t: any) => t && !t.parent?.()).length;
    const extraCount = Math.max(0, allTagsCount - categories.length);

    return (
      <section className="AvocadoHome-section AvocadoHome-section--categories">
        <div className="AvocadoHome-sectionHead">
          <h2>{heading}</h2>
          {this.renderInlineNav()}
        </div>
        <div className="AvocadoHome-categories">
          {[...categories.map((cat: any, idx: number) => this.renderCategoryCard(cat, idx)), this.renderAllCategoriesTile(extraCount)]}
        </div>
      </section>
    );
  }

  private sortedCategories() {
    const featuredIds = getFeaturedTagIds();
    return this.state.topCategories(7).sort((a: any, b: any) => {
      const aF = featuredIds.has(String(a.id?.()));
      const bF = featuredIds.has(String(b.id?.()));
      if (aF === bF) return 0;
      return aF ? -1 : 1;
    });
  }

  private renderCategoryCard(cat: any, idx: number) {
    const featuredIds = getFeaturedTagIds();
    const catColor = cat.color?.() || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
    const catIcon = cat.icon?.() || FALLBACK_ICONS[idx % FALLBACK_ICONS.length];
    const catRoute = tagRoute(cat);
    const count = numberOr(cat.discussionCount?.(), 0);
    const isFeatured = featuredIds.has(String(cat.id?.()));

    return (
      <a
        key={cat.id?.()}
        className={`AvocadoHome-categoryCard${isFeatured ? ' AvocadoHome-categoryCard--featured' : ''}`}
        href={catRoute}
        onclick={(e: Event) => navigate(e as MouseEvent, catRoute)}
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
          <p>
            {abbreviateNumber(numberOr(count, 0))}{' '}
            {count === 1
              ? trans('ramon-avocado.forum.home.discussion_singular', 'discussion')
              : trans('ramon-avocado.forum.home.discussions', 'discussions')}
          </p>
        </div>
      </a>
    );
  }

  private renderAllCategoriesTile(extraCount: number) {
    return (
      <a
        key="--all"
        className="AvocadoHome-categoryCard AvocadoHome-categoryCard--all"
        href={safeRoute('tags')}
        onclick={(e: Event) => navigate(e as MouseEvent, safeRoute('tags'))}
      >
        <div className="AvocadoHome-categoryBody">
          <h3>{trans('ramon-avocado.forum.home.all_categories', 'All categories')}</h3>
          <p>
            {extraCount} {trans('ramon-avocado.forum.home.more', 'more')}
          </p>
        </div>
        <i className="fas fa-arrow-right" aria-hidden="true" />
      </a>
    );
  }

  /**
   * Render an inline nav (categories section header) by re-using IndexSidebar's
   * navItems and stripping items the home already represents (tags, popular).
   */
  private renderInlineNav() {
    let itemList;
    try {
      itemList = (IndexSidebar as any).prototype.navItems.call({});
    } catch {
      return null;
    }
    itemList.remove('tags');
    itemList.remove('popularHome');
    itemList.remove('allDiscussions');

    const items = itemList.toArray().filter((item: any) => {
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
      <div className="AvocadoHome-sectionHead-nav">
        <nav className="AvocadoHomeNav AvocadoHomeNav--inline" aria-label={extractText(app.translator.trans('ramon-avocado.forum.home.nav_label'))}>
          {items}
        </nav>
      </div>
    );
  }

  // ── Showcase slider ─────────────────────────────────────────────────────────

  private renderShowcaseSlider() {
    if (!app.forum?.attribute('avocadoShowcaseEnabled')) return null;
    const tagId = app.forum?.attribute('avocadoShowcaseTag');
    if (!tagId) return null;
    const isFollowingPage = app.current.get?.('routeName') === 'following';
    if (isFollowingPage) return null;

    const tag = app.store.getById('tags', String(tagId)) as any;
    const showcaseCount = Math.max(1, Math.min(5, parseInt(app.forum?.attribute('avocadoShowcaseCount') as string) || 5));
    const items = [...this.state.showcase()].sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0)).slice(0, showcaseCount);

    const heading =
      app.forum?.attribute<string>('avocadoShowcaseHeading') || tag?.name?.() || trans('ramon-avocado.forum.home.showcase_heading', 'Showcase');

    if (this.state.showcaseLoading && items.length === 0) {
      const phpCount = parseInt(String(app.forum?.attribute('avocadoShowcaseItemCount') ?? ''), 10);
      const skeletonCount = phpCount > 0 ? phpCount : showcaseCount;
      return (
        <section className="AvocadoHome-section AvocadoHome-section--showcase">
          <div className="AvocadoHome-sectionHead">
            <h2>{heading}</h2>
            <OnlineUsers />
          </div>
          <div className="AvocadoHome-showcaseGrid">{renderShowcaseSkeleton(skeletonCount)}</div>
        </section>
      );
    }

    if (!this.state.showcaseLoading && items.length === 0) return null;

    return (
      <section className="AvocadoHome-section AvocadoHome-section--showcase">
        <div className="AvocadoHome-sectionHead">
          <h2>{heading}</h2>
          <OnlineUsers />
        </div>
        <div className="AvocadoHome-showcaseGrid">{items.map((d: any, i: number) => this.renderShowcaseCard(d, i === 0))}</div>
      </section>
    );
  }

  private renderShowcaseCard(discussion: any, isFirst = false) {
    if (!discussion) return null;

    const id = discussion.id?.();
    const title = discussion.title?.() || trans('ramon-avocado.forum.home.untitled', 'Untitled');
    const href = discussionRoute(discussion);
    const firstPost = discussion.firstPost?.();
    const isSticky = discussion.isSticky?.() || false;
    const showcaseTagIds = this.state.showcaseTagIds();
    const imageStyle = app.forum?.attribute('avocadoShowcaseImageStyle') || 'default';

    const allTags = (discussion.tags?.() || []).filter(Boolean);
    const otherTags = allTags.filter((t: any) => !showcaseTagIds.has(String(t.id?.())));
    const primaryTag = allTags.find((t: any) => showcaseTagIds.has(String(t.id?.()))) || allTags[0] || null;
    const tagColor = primaryTag?.color?.() || null;
    // Image priority: discussion's own hero image (uploaded at creation when
    // the tag asked for one) → first inline image from the post → tag-color
    // gradient (handled by `noImgBg` below).
    const imageUrl = getDiscussionHeroImageUrl(discussion) || this.extractFirstImage(firstPost);
    const excerpt = postPreview(discussion, 140);

    const noImgBg = tagColor
      ? imageStyle === 'full'
        ? `linear-gradient(135deg,rgba(${hexToRgbTriplet(tagColor)},0.50),rgba(${hexToRgbTriplet(tagColor)},0.30))`
        : `linear-gradient(135deg,rgba(${hexToRgbTriplet(tagColor)},0.18),rgba(${hexToRgbTriplet(tagColor)},0.06))`
      : 'linear-gradient(135deg,var(--avocado-surface-1),var(--control-bg))';

    const rawDate = discussion.createdAt?.();
    const dateStr = formatTimeLabel(rawDate);
    const dateIso = rawDate ? new Date(rawDate).toISOString() : '';
    const user = discussion.user?.();
    const cardClass = ['AvocadoHome-showcaseCard', imageStyle === 'full' && 'AvocadoHome-showcaseCard--full'].filter(Boolean).join(' ');

    return (
      <article key={id} className={cardClass} style={tagColor ? { '--card-accent': tagColor } : {}}>
        {isSticky && (
          <div className="AvocadoHome-showcaseCard-badges">
            <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="bottom">
              <span
                className="AvocadoHome-badge AvocadoHome-badge--sticky"
                role="img"
                aria-label={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')}
              >
                <i className="fas fa-thumbtack" aria-hidden="true" />
              </span>
            </Tooltip>
          </div>
        )}

        {otherTags.length > 0 && (
          <div className="AvocadoHome-showcaseCard-topTags">{otherTags.slice(0, 2).map((tag: any) => this.renderShowcaseTagPill(tag))}</div>
        )}

        <a className="AvocadoHome-showcaseCard-link" href={href} onclick={(e: Event) => navigate(e as MouseEvent, href)}>
          {this.renderShowcaseImage(imageUrl, title, isFirst, primaryTag, tagColor, noImgBg)}
          {imageStyle === 'full' && <div className="AvocadoHome-showcaseCard-colorOverlay" />}

          <div className="AvocadoHome-showcaseCard-body">
            {dateStr && (
              <span className="AvocadoHome-showcaseCard-date">
                <time datetime={dateIso}>{dateStr}</time>
              </span>
            )}
            <div className="AvocadoHome-showcaseCard-titleRow">
              <span className="AvocadoHome-showcaseCard-title">{title}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="AvocadoHome-showcaseCard-arrow"
                aria-hidden="true"
              >
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

  private renderShowcaseTagPill(tag: any) {
    const c = tag.color?.() || null;
    const slug = tag.slug?.();
    const tagHref = slug ? app.route('tag', { tags: slug }) : null;
    return (
      <a
        key={tag.id?.()}
        className="AvocadoHome-tagPill"
        style={c ? { '--tag-bg': '#ffffff', '--tag-color': c } : { '--tag-bg': '#ffffff' }}
        href={tagHref}
        onclick={
          tagHref
            ? (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                m.route.set(tagHref);
              }
            : undefined
        }
      >
        {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
        {tag.name?.()}
      </a>
    );
  }

  private renderShowcaseImage(imageUrl: string | null, title: string, isFirst: boolean, primaryTag: any, tagColor: string | null, noImgBg: string) {
    if (imageUrl) {
      // First card eager-loads with high priority; subsequent cards use an
      // IntersectionObserver to defer the request until they enter the viewport.
      if (isFirst) {
        return (
          <img className="AvocadoHome-showcaseCard-img" src={imageUrl} alt={title} width="400" height="150" loading="eager" fetchpriority="high" />
        );
      }
      return (
        <img
          className="AvocadoHome-showcaseCard-img"
          alt={title}
          width="400"
          height="150"
          oncreate={(vnode: any) => {
            const io = new IntersectionObserver(
              ([entry]) => {
                if (entry.isIntersecting) {
                  vnode.dom.src = imageUrl;
                  io.disconnect();
                }
              },
              { rootMargin: '200px' }
            );
            io.observe(vnode.dom);
          }}
        />
      );
    }
    return (
      <div className="AvocadoHome-showcaseCard-noImg" style={{ background: noImgBg }}>
        {primaryTag?.icon?.() && <i className={primaryTag.icon()} aria-hidden="true" style={tagColor ? { color: tagColor } : {}} />}
      </div>
    );
  }

  /**
   * Heuristic: extract the first non-icon-sized image from a post's content.
   *
   * Tries the rendered HTML first (`contentHtml`), filters out tiny icons
   * (<=32×32), and falls back to scanning the raw markdown for a Markdown image
   * or bare image URL.
   */
  private extractFirstImage(post: any): string | null {
    if (!post) return null;

    const html =
      post.data?.attributes?.contentHtml ||
      post.attribute?.('contentHtml') ||
      (typeof post.contentHtml === 'function' ? post.contentHtml() : null) ||
      '';

    if (html && typeof html === 'string') {
      try {
        // DOMParser instead of innerHTML: isolated document context, no script
        // execution risk, and makes intent explicit to security scanners.
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const imgs = doc.querySelectorAll('img[src]');
        for (const img of imgs as any) {
          const src = img.getAttribute('src') || '';
          if (!src || /^(javascript|data|vbscript):/i.test(src.trim())) continue;
          const w = parseInt(img.getAttribute('width') || '999', 10);
          const h = parseInt(img.getAttribute('height') || '999', 10);
          if (w <= 32 && h <= 32) continue;
          return src;
        }
      } catch {
        /* malformed HTML — fall through to the markdown scan */
      }
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

  // ── Popular / Following section ─────────────────────────────────────────────

  private renderPopularSection(popular: any[], isFollowingPage: boolean) {
    const heading = isFollowingPage
      ? (app.forum?.attribute('avocadoFollowingHeading') as string)?.trim() || trans('ramon-avocado.forum.home.following_heading', 'Following')
      : (app.forum?.attribute('avocadoPopularHeading') as string)?.trim() || trans('ramon-avocado.forum.home.popular_heading', 'Popular discussions');

    const showcaseTagIds = this.state.showcaseTagIds();

    return (
      <section className="AvocadoHome-section">
        <div className="AvocadoHome-sectionHead">
          <h2>{heading}</h2>
          <div className="AvocadoHome-sectionHead-right">
            {this.sectionHasNew && <span className="AvocadoStatDot AvocadoHome-sectionDot" aria-hidden="true" />}
            {!app.forum?.attribute('avocadoShowcaseEnabled') && <OnlineUsers />}
            <a
              className="AvocadoHome-seeAll"
              href={safeRoute('avocado-discussions')}
              onclick={(e: Event) => navigate(e as MouseEvent, safeRoute('avocado-discussions'))}
            >
              {trans('ramon-avocado.forum.home.see_all', 'See all')} <i className="fas fa-arrow-right" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="AvocadoHome-threadStack">
          {popular.length === 0 && this.state.homeLoading
            ? renderThreadSkeleton(5)
            : popular.length === 0
              ? renderEmpty(trans('ramon-avocado.forum.home.popular_no_discussions', 'No discussions yet.'))
              : popular.map((d: any) => (
                  <ThreadCard
                    key={d.id?.()}
                    discussion={d}
                    context={this}
                    likingIds={this.likingIds}
                    updatedLikeIds={this.updatedLikeIds}
                    newDiscIds={this.newDiscIds}
                    onToggleLike={(disc: any) => toggleDiscussionLike(disc, this.likingIds, this.selfActionIds)}
                    filterTagIds={showcaseTagIds}
                  />
                ))}
        </div>
      </section>
    );
  }
}
