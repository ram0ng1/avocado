// @ts-nocheck
import app from 'flarum/forum/app';
import humanTime from 'flarum/common/helpers/humanTime';
import sortTags from 'ext:flarum/tags/common/utils/sortTags';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import Tooltip from 'flarum/common/components/Tooltip';
import {
  trans,
  iconColors,
  tagRoute,
  navigate,
  getFeaturedTagIds,
  resolveAssetUrl,
} from '../utils';

function renderTagCard(tag: any, featured = false) {
  const color    = tag.color?.();
  const { bg: iconBg, color: iconColor } = iconColors(color, 0.12);
  const href     = tagRoute(tag);
  const lastDisc = tag.lastPostedDiscussion?.();
  const children = sortTags(((tag.children?.() || []) as any[]).filter(Boolean)) as any[];
  const count    = tag.discussionCount?.() || 0;

  const lastDiscHref = (() => {
    if (!lastDisc) return href;
    try { return app.route.discussion(lastDisc, lastDisc.lastPostNumber?.()); } catch { return href; }
  })();

  return (
    <li key={tag.id()} className={`AvocadoTagsPage-tagCard${featured ? ' AvocadoTagsPage-tagCard--featured' : ''}`}>
      {featured && (
        <Tooltip text={trans('ramon-avocado.forum.tags.featured', 'Featured')} position="top">
          <span className="AvocadoTagsPage-featuredBadge">
            <img src={resolveAssetUrl('fire.webp') || ''} alt="" aria-hidden="true" width="20" height="20" />
          </span>
        </Tooltip>
      )}
      <a className="AvocadoTagsPage-tagCard-main" href={href} onclick={(e: Event) => navigate(e as MouseEvent, href)}>
        <div className="AvocadoTagsPage-tagCard-top">
          <span className="AvocadoTagsPage-tagCard-icon" style={{ '--icon-bg': iconBg, '--icon-color': iconColor }}>
            <i className={tag.icon?.() || 'fas fa-tag'} aria-hidden="true" />
          </span>
          <div className="AvocadoTagsPage-tagCard-info">
            <h2 className="AvocadoTagsPage-tagCard-name">{tag.name?.()}</h2>
            <span className="AvocadoTagsPage-tagCard-count">
              {count} {count === 1
                ? trans('ramon-avocado.forum.tags.discussion_singular', 'discussion')
                : trans('ramon-avocado.forum.tags.discussion_plural', 'discussions')}
            </span>
          </div>
        </div>
        {tag.description?.() && <p className="AvocadoTagsPage-tagCard-desc">{tag.description()}</p>}
      </a>

      {children.length > 0 && (
        <div className="AvocadoTagsPage-tagCard-children">
          {children.map((child: any) => {
            const childColor = child.color?.() || color;
            const childHref  = tagRoute(child);
            const ic         = iconColors(childColor, 0.1);
            return (
              <a
                key={child.id()}
                className="AvocadoTagsPage-childPill"
                href={childHref}
                onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, childHref); }}
                style={{ '--cp-bg': ic.bg, '--cp-color': ic.color }}
              >
                {child.icon?.() && <i className={child.icon()} aria-hidden="true" />}
                {child.name?.()}
              </a>
            );
          })}
        </div>
      )}

      {lastDisc && (
        <a
          className="AvocadoTagsPage-tagCard-last"
          href={lastDiscHref}
          onclick={(e: Event) => { e.stopPropagation(); navigate(e as MouseEvent, lastDiscHref); }}
        >
          <i className="far fa-clock" aria-hidden="true" />
          <span className="AvocadoTagsPage-tagCard-last-title">{lastDisc.title?.()}</span>
          <span className="AvocadoTagsPage-tagCard-last-time">{humanTime(lastDisc.lastPostedAt?.())}</span>
        </a>
      )}
    </li>
  );
}

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

/** Override target for TagsPage.prototype.view — `this` = native Flarum TagsPage instance */
export function tagPageView(this: any, _original: () => any) {
  const tags    = (this.tags || []) as any[];
  const loading = !!this.loading;

  const featuredIds = getFeaturedTagIds();

  const primaryTags = tags
    .filter((t: any) => t.position?.() !== null)
    .sort((a: any, b: any) => {
      const aF = featuredIds.has(String(a.id()));
      const bF = featuredIds.has(String(b.id()));
      if (aF !== bF) return aF ? -1 : 1;
      return (a.position?.() ?? 9999) - (b.position?.() ?? 9999);
    });

  const cloudTags = tags.filter((t: any) => t.position?.() === null);

  const homeHref = (() => { try { return app.route('index'); } catch { return '/'; } })();
  const discHref = (() => { try { return app.route('avocado-discussions'); } catch { return '/discussions'; } })();

  return (
    <div className="AvocadoTagsPage">
      <div className="AvocadoNav-helper"><IndexSidebar /></div>

      <div className="AvocadoTagsPage-header">
        <h1 className="AvocadoTagsPage-title">{trans('ramon-avocado.forum.tags.title', 'Categories')}</h1>
        <div className="AvocadoTagsPage-headerActions">
          <a className="AvocadoTagsPage-headerLink" href={discHref} onclick={(e: Event) => navigate(e as MouseEvent, discHref)}>
            <i className="fas fa-list" aria-hidden="true" />
            {trans('ramon-avocado.forum.tags.all_discussions', 'All discussions')}
          </a>
          <a className="AvocadoTagsPage-headerLink" href={homeHref} onclick={(e: Event) => navigate(e as MouseEvent, homeHref)}>
            <i className="fas fa-house" aria-hidden="true" />
            {trans('ramon-avocado.forum.tags.home', 'Home')}
          </a>
        </div>
      </div>

      <ul className="AvocadoTagsPage-grid">
        {loading
          ? renderSkeleton()
          : primaryTags.map((tag: any) => renderTagCard(tag, featuredIds.has(String(tag.id()))))}
      </ul>

      {!loading && cloudTags.length > 0 && (
        <div className="AvocadoTagsPage-cloud">
          <p className="AvocadoTagsPage-cloud-label">{trans('ramon-avocado.forum.tags.other_tags_label', 'Other Tags')}</p>
          <div className="AvocadoTagsPage-cloud-pills">
            {cloudTags.map((tag: any) => {
              const color = tag.color?.();
              const href  = tagRoute(tag);
              const count = tag.discussionCount?.() || 0;
              const ic    = iconColors(color, 0.1);
              return (
                <a
                  key={tag.id()}
                  className="AvocadoTagsPage-cloudPill"
                  href={href}
                  onclick={(e: Event) => navigate(e as MouseEvent, href)}
                  style={{ '--cp-bg': ic.bg, '--cp-color': ic.color }}
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
