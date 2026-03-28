import app from 'flarum/forum/app';
import humanTime from 'flarum/common/helpers/humanTime';
import sortTags from 'ext:flarum/tags/common/utils/sortTags';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import Tooltip from 'flarum/common/components/Tooltip';
import {
  trans,
  numberOr,
  hexToRgba,
  iconColors,
  displayName,
  formatTimeLabel,
  postPreview,
  tagRoute,
} from '../utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const navigate = (e, href) => {
  e.preventDefault();
  m.route.set(href);
};

const tagHref = (tag) => {
  try { return app.route.tag(tag); } catch (e) { return '#'; }
};

// ─── Tag card (primary tag) ───────────────────────────────────────────────────

function renderTagCard(tag, featured = false, fireUrl = '') {
  const color   = tag.color?.() || '#3f88f6';
  const { bg: iconBg, color: iconColor } = iconColors(color, 0.12);
  const href    = tagHref(tag);
  const lastDisc = tag.lastPostedDiscussion?.();
  const children = sortTags((tag.children?.() || []).filter(Boolean));
  const count   = tag.discussionCount?.() || 0;

  const lastDiscHref = (() => {
    if (!lastDisc) return href;
    try { return app.route.discussion(lastDisc, lastDisc.lastPostNumber?.()); } catch (e) { return href; }
  })();

  return (
    <li
      key={tag.id()}
      className={`AvocadoTagsPage-tagCard${featured ? ' AvocadoTagsPage-tagCard--featured' : ''}`}
    >
      {featured && fireUrl && (
        <Tooltip text={trans('ramon-avocado.forum.tags.featured', 'Featured')} position="top">
          <span className="AvocadoTagsPage-featuredBadge">
            <img src={fireUrl} alt="" aria-hidden="true" />
          </span>
        </Tooltip>
      )}
      {/* Main clickable area */}
      <a className="AvocadoTagsPage-tagCard-main" href={href} onclick={(e) => navigate(e, href)}>
        <div className="AvocadoTagsPage-tagCard-top">
          <span
            className="AvocadoTagsPage-tagCard-icon"
            style={{ '--icon-bg': iconBg, '--icon-color': iconColor }}
          >
            <i className={tag.icon?.() || 'fas fa-tag'} aria-hidden="true" />
          </span>
          <div className="AvocadoTagsPage-tagCard-info">
            <h3 className="AvocadoTagsPage-tagCard-name">{tag.name?.()}</h3>
            <span className="AvocadoTagsPage-tagCard-count">
              {count} {count === 1 ? trans('ramon-avocado.forum.tags.discussion_singular', 'discussion') : trans('ramon-avocado.forum.tags.discussion_plural', 'discussions')}
            </span>
          </div>
        </div>
        {tag.description?.() && (
          <p className="AvocadoTagsPage-tagCard-desc">{tag.description()}</p>
        )}
      </a>

      {/* Child tag pills */}
      {children.length > 0 && (
        <div className="AvocadoTagsPage-tagCard-children">
          {children.map((child) => {
            const childColor = child.color?.() || color;
            const childHref  = tagHref(child);
            return (
              <a
                key={child.id()}
                className="AvocadoTagsPage-childPill"
                href={childHref}
                onclick={(e) => { e.stopPropagation(); navigate(e, childHref); }}
                style={(() => { const ic = iconColors(childColor, 0.1); return { '--cp-bg': ic.bg, '--cp-color': ic.color }; })()}
              >
                {child.icon?.() && <i className={child.icon()} aria-hidden="true" />}
                {child.name?.()}
              </a>
            );
          })}
        </div>
      )}

      {/* Last posted discussion footer */}
      {lastDisc && (
        <a
          className="AvocadoTagsPage-tagCard-last"
          href={lastDiscHref}
          onclick={(e) => { e.stopPropagation(); navigate(e, lastDiscHref); }}
        >
          <i className="far fa-clock" aria-hidden="true" />
          <span className="AvocadoTagsPage-tagCard-last-title">{lastDisc.title?.()}</span>
          <span className="AvocadoTagsPage-tagCard-last-time">{humanTime(lastDisc.lastPostedAt?.())}</span>
        </a>
      )}
    </li>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function renderSkeleton() {
  return [0, 1, 2, 3].map((i) => (
    <li key={String(i)} className="AvocadoTagsPage-tagCard AvocadoTagsPage-tagCard--skeleton">
      <div className="AvocadoTagsPage-tagCard-main AvocadoTagsPage-tagCard-main--nolink">
        <div className="AvocadoTagsPage-tagCard-top">
          <span className="AvocadoTagsPage-tagCard-icon AvocadoTagsPage-shimmer" />
          <div className="AvocadoTagsPage-tagCard-info">
            <div className="AvocadoTagsPage-shimmer AvocadoTagsPage-shimmer--name" />
            <div className="AvocadoTagsPage-shimmer AvocadoTagsPage-shimmer--count" />
          </div>
        </div>
        <div className="AvocadoTagsPage-shimmer AvocadoTagsPage-shimmer--desc" />
      </div>
    </li>
  ));
}

// ─── Main view (used as override target for TagsPage.prototype.view) ──────────
// 'this' = native Flarum TagsPage instance (has this.loading, this.tags)

export function tagPageView(original) {
  const tags        = this.tags || [];
  const loading     = !!this.loading;

  const featuredIds = (() => {
    try {
      const raw = app.forum?.attribute('avocadoFeaturedTags');
      return new Set((raw ? JSON.parse(raw) : []).map(String));
    } catch (_) { return new Set(); }
  })();

  const fireUrl = (() => {
    const base = app.forum?.attribute('assetsBaseUrl') || '';
    if (base) return base.replace(/\/+$/, '') + '/fire.webp';
    return (app.forum?.attribute('baseUrl') || '').replace(/\/+$/, '') + '/assets/fire.webp';
  })();

  const primaryTags = tags
    .filter((t) => t.position?.() !== null)
    .sort((a, b) => {
      const aF = featuredIds.has(String(a.id()));
      const bF = featuredIds.has(String(b.id()));
      if (aF !== bF) return aF ? -1 : 1;
      return (a.position?.() ?? 9999) - (b.position?.() ?? 9999);
    });
  const cloudTags   = tags.filter((t) => t.position?.() === null);

  const homeHref = (() => { try { return app.route('index'); } catch (e) { return '/'; } })();
  const discHref = (() => { try { return app.route('avocado-discussions'); } catch (e) { return '/discussions'; } })();

  return (
    <div className="AvocadoTagsPage">
      <div className="AvocadoNav-helper"><IndexSidebar /></div>

      {/* ── Header ── */}
      <div className="AvocadoTagsPage-header">
        <h1 className="AvocadoTagsPage-title">{trans('ramon-avocado.forum.tags.title', 'Categories')}</h1>
        <div className="AvocadoTagsPage-headerActions">
          <a className="AvocadoTagsPage-headerLink" href={discHref} onclick={(e) => navigate(e, discHref)}>
            <i className="fas fa-list" aria-hidden="true" />
            {trans('ramon-avocado.forum.tags.all_discussions', 'All discussions')}
          </a>
          <a className="AvocadoTagsPage-headerLink" href={homeHref} onclick={(e) => navigate(e, homeHref)}>
            <i className="fas fa-house" aria-hidden="true" />
            {trans('ramon-avocado.forum.tags.home', 'Home')}
          </a>
        </div>
      </div>

      {/* ── Primary tags grid ── */}
      <ul className="AvocadoTagsPage-grid">
        {loading ? renderSkeleton() : primaryTags.map((tag) => renderTagCard(tag, featuredIds.has(String(tag.id())), fireUrl))}
      </ul>

      {/* ── Cloud / secondary tags ── */}
      {!loading && cloudTags.length > 0 && (
        <div className="AvocadoTagsPage-cloud">
          <p className="AvocadoTagsPage-cloud-label">{trans('ramon-avocado.forum.tags.other_tags_label', 'Other Tags')}</p>
          <div className="AvocadoTagsPage-cloud-pills">
            {cloudTags.map((tag) => {
              const color = tag.color?.() || '#3f88f6';
              const href  = tagHref(tag);
              const count = tag.discussionCount?.() || 0;
              return (
                <a
                  key={tag.id()}
                  className="AvocadoTagsPage-cloudPill"
                  href={href}
                  onclick={(e) => navigate(e, href)}
                  style={(() => { const ic = iconColors(color, 0.1); return { '--cp-bg': ic.bg, '--cp-color': ic.color }; })()}
                >
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name?.()}
                  {count > 0 && <span className="AvocadoTagsPage-cloudPill-count">{count}</span>}
                </a>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
