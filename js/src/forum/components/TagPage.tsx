import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';

import {
  trans,
  tagRoute,
  navigate,
  renderThreadSkeleton,
  renderLoadMore,
  renderEmpty,
} from '../utils';
import { toggleDiscussionLike } from '../utils/likes';
import { DISCUSSION_LIST_SORT } from '../utils/sortOptions';
import { bindDiscussionFeedRealtime } from '../utils/discussionRealtime';
import { applyColor, clearColor } from '../colored';

import DiscussionFeedState from '../states/DiscussionFeedState';

import ThreadCard from './shared/ThreadCard';
import SortDropdown from './shared/SortDropdown';
import WsUpdateBanner from './shared/WsUpdateBanner';

const findTagBySlug = (slug: string): any =>
  app.store.all('tags').find(
    (t: any) => t.slug?.().localeCompare(slug, undefined, { sensitivity: 'base' }) === 0
  ) || null;

/**
 * AvocadoTagPage — list of discussions filtered by a single tag.
 *
 * Uses `DiscussionFeedState` for pagination + realtime queue, then layers a
 * tag-aware filter on top of the realtime handlers so only events for
 * discussions in the current tag affect this view.
 */
export default class AvocadoTagPage extends Page {
  private tag: any = null;
  private tagLoading = false;
  private feedState!: DiscussionFeedState;
  private likingIds = new Set<string>();
  private unbindRealtime: (() => void) | null = null;
  private currentSlug = '';

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--index';
    this.currentSlug = m.route.param('tags');
    this.loadTag(this.currentSlug);
  }

  onbeforeupdate() {
    const newSlug = m.route.param('tags');
    if (newSlug && newSlug !== this.currentSlug) {
      this.currentSlug = newSlug;
      this.tag = null;
      this.feedState?.clear();
      this.loadTag(newSlug);
    }
    return true;
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);
    this.bindRealtime();
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    clearColor();
    this.unbindRealtime?.();
    this.unbindRealtime = null;
  }

  private bindRealtime() {
    this.unbindRealtime = bindDiscussionFeedRealtime({
      // Only react to broadcasts whose discussion belongs to the current tag.
      filter: (disc: any) => {
        const tagId = String(this.tag?.id?.() || '');
        if (!tagId) return false;
        const tags: any[] = disc?.tags?.() || [];
        return tags.some((t: any) => String(t?.id?.() || '') === tagId);
      },
      selfActionIds: this.feedState?.selfActionIds,
      updatedLikeIds: this.feedState?.updatedLikeIds,
      pendingDiscs: this.feedState?.pendingDiscs,
      currentItems: () => this.feedState?.flatItems() || [],
      onFetchFailure: () => {
        if (this.feedState) this.feedState.wsFetchFailures++;
      },
    });
  }

  // ── Data loading ────────────────────────────────────────────────────────────

  private loadTag(slug: string) {
    if (!slug) return;

    const cached = findTagBySlug(slug);
    if (cached) {
      this.tag = cached;
      if (app.forum.attribute('avocadoColoredEnabled')) applyColor(cached.color?.() || null);
      this.initFeed();
      return;
    }

    this.tagLoading = true;
    app.store
      .find('tags', slug, { include: 'children,children.parent,parent' })
      .then(() => {
        this.tag = findTagBySlug(slug);
        this.tagLoading = false;
        if (this.tag) {
          if (app.forum.attribute('avocadoColoredEnabled')) applyColor(this.tag.color?.() || null);
          this.initFeed();
        }
        m.redraw();
      })
      .catch(() => {
        this.tagLoading = false;
        m.redraw();
      });
  }

  /** Build (or reset) the feed state filtered to the current tag's slug. */
  private initFeed() {
    if (!this.tag) return;
    this.feedState = new DiscussionFeedState({
      sort: 'latest',
      filter: { tag: this.tag.slug() },
    } as any);
    this.feedState.refresh();
  }

  // ── View ────────────────────────────────────────────────────────────────────

  view() {
    app.currentTag?.(true);

    if (this.tagLoading) return this.renderLoading();
    if (!this.tag) return this.renderNotFound();

    return this.renderTagPage();
  }

  private renderTagPage() {
    const tag = this.tag;
    const color = tag.color?.() || '';
    const tagName = tag.name?.() || '';
    const tagDesc = tag.description?.() || '';
    const tagIcon = tag.icon?.() || null;
    const count = tag.discussionCount?.() || 0;
    const children = ((tag.children?.() || []) as any[]).filter(Boolean);
    const discHref = (() => {
      try { return app.route('avocado-discussions'); }
      catch { return '/discussions'; }
    })();

    const discussions = this.feedState?.flatItems() ?? [];
    const isLoadingNext = !!this.feedState?.isLoadingNext();
    const isInitialLoading = !!this.feedState?.isInitialLoading();
    const currentSort = (this.feedState?.getParams() as any)?.sort || 'latest';

    return (
      <div className="AvocadoTagPage">
        <div className="AvocadoNav-helper"><IndexSidebar key={m.route.param('tags')} /></div>

        <header className="AvocadoTagPage-hero" style={{ '--tag-color': color }}>
          <div className="AvocadoTagPage-hero-inner">
            <div className="AvocadoTagPage-hero-row">
              <button
                className="AvocadoTagPage-back"
                aria-label="Back"
                onclick={() => {
                  if (window.history.length > 1) window.history.back();
                  else m.route.set(app.route('index'));
                }}
              >
                <i className="fas fa-arrow-left" aria-hidden="true" />
              </button>

              {tagIcon && (
                <span className="AvocadoTagPage-hero-icon">
                  <i className={tagIcon} aria-hidden="true" />
                </span>
              )}

              <div className="AvocadoTagPage-hero-text">
                <h1 className="AvocadoTagPage-hero-name">{tagName}</h1>
                <span className="AvocadoTagPage-hero-count">
                  {count}{' '}
                  {count === 1
                    ? trans('ramon-avocado.forum.tags.discussion_singular', 'discussion')
                    : trans('ramon-avocado.forum.tags.discussion_plural', 'discussions')}
                </span>
              </div>

              {children.length > 0 && (
                <div className="AvocadoTagPage-hero-subtags">
                  {children.slice(0, 6).map((child: any) => {
                    const childHref = tagRoute(child);
                    return (
                      <a
                        key={child.id?.()}
                        className="AvocadoTagPage-subtag"
                        href={childHref}
                        onclick={(e: Event) => navigate(e as MouseEvent, childHref)}
                      >
                        {child.name?.()}
                      </a>
                    );
                  })}
                </div>
              )}

              <button className="AvocadoTagPage-newBtn" onclick={() => this.openComposer(tag)}>
                <i className="fas fa-plus" aria-hidden="true" />
                {trans('ramon-avocado.forum.home.new_discussion', 'New discussion')}
              </button>
            </div>

            {tagDesc && <p className="AvocadoTagPage-hero-desc">{tagDesc}</p>}
          </div>
        </header>

        <div className="AvocadoTagPage-body">
          <div className="AvocadoTagPage-controls">
            <SortDropdown
              options={DISCUSSION_LIST_SORT}
              currentKey={currentSort}
              onChange={(key: string) =>
                this.feedState.refreshParams({ sort: key, filter: { tag: tag.slug() } } as any, 1)
              }
            />
            <a
              className="AvocadoTagPage-allDiscLink"
              href={discHref}
              onclick={(e: Event) => navigate(e as MouseEvent, discHref)}
            >
              {trans('ramon-avocado.forum.home.all_title', 'All Discussions')}
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </a>
          </div>

          <WsUpdateBanner
            pendingCount={this.feedState?.pendingCount() ?? 0}
            onFlush={() => this.feedState?.flushPending()}
          />

          <div className="AvocadoHome-threadStack">
            {discussions.map((d: any) => (
              <ThreadCard
                key={d.id?.()}
                discussion={d}
                context={this}
                likingIds={this.likingIds}
                updatedLikeIds={this.feedState.updatedLikeIds}
                newDiscIds={this.feedState.newDiscIds}
                currentTag={this.tag}
                onToggleLike={(disc: any) => toggleDiscussionLike(disc, this.likingIds, this.feedState.selfActionIds)}
              />
            ))}
            {isLoadingNext && renderThreadSkeleton()}
            {!isLoadingNext && discussions.length === 0 && !isInitialLoading &&
              renderEmpty('No discussions in this category yet.')}
            {isInitialLoading && discussions.length === 0 && renderThreadSkeleton()}
          </div>

          {this.feedState?.hasNext() && !isLoadingNext &&
            renderLoadMore('Load more', () => this.feedState.loadNext())}
        </div>
      </div>
    );
  }

  // ── View helpers ────────────────────────────────────────────────────────────

  private renderLoading() {
    return (
      <div className="AvocadoTagPage">
        <div className="AvocadoTagPage-hero" style={{ '--tag-color': '#8f8f99' }}>
          <div className="AvocadoTagPage-hero-inner">
            <div className="AvocadoTagPage-hero-body">
              <div style={{ flex: 1 }}>
                <div
                  className="AvocadoTagsPage-shimmer AvocadoTagsPage-shimmer--name"
                  style={{ width: '200px', height: '30px' }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="AvocadoTagPage-body">{renderThreadSkeleton()}</div>
      </div>
    );
  }

  private renderNotFound() {
    return (
      <div className="AvocadoTagPage">
        <div className="AvocadoTagPage-body">
          <div className="AvocadoDiscussions-empty">Tag not found.</div>
        </div>
      </div>
    );
  }

  private openComposer(tag: any) {
    if (!app.session.user) {
      app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));
      return;
    }
    const parent = tag.parent?.();
    const selectedTags = parent ? [parent, tag] : [tag];
    app.composer
      .load(
        () => (flarum as any).reg.asyncModuleImport('flarum/forum/components/DiscussionComposer'),
        { user: app.session.user }
      )
      .then(() => {
        app.composer.fields.tags = selectedTags;
        app.composer.show();
        m.redraw();
      });
  }
}
