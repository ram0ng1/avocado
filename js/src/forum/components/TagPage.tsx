// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import { trans, tagRoute, navigate, renderThreadSkeleton, renderLoadMore, renderEmpty } from '../utils';
import { applyColor, clearColor } from '../colored';
import ThreadCard from './shared/ThreadCard';
import SortDropdown, { SortOption } from './shared/SortDropdown';
import WsUpdateBanner from './shared/WsUpdateBanner';
import { bindRealtime, pushPayloadDiscussion } from '../realtime';

const SORT_OPTIONS: SortOption[] = [
  { key: 'latest',  label: 'Latest',  sort: '-lastPostedAt' },
  { key: 'top',     label: 'Top',     sort: '-commentCount' },
  { key: 'newest',  label: 'Newest',  sort: '-createdAt'    },
  { key: 'oldest',  label: 'Oldest',  sort: 'createdAt'     },
];

const PAGE_SIZE = 20;

const findTagBySlug = (slug: string): any =>
  app.store.all('tags').find(
    (t: any) => t.slug?.().localeCompare(slug, undefined, { sensitivity: 'base' }) === 0
  ) || null;

export default class AvocadoTagPage extends Page {
  private tag: any = null;
  private tagLoading = false;
  private discussions: any[] = [];
  private loading = false;
  private hasMore = false;
  private sort = 'latest';
  private offset = 0;
  private likingIds     = new Set<string>();
  private _wsUpdates    = 0;
  private _unbindRealtime: (() => void) | null = null;
  private _updatedLikeIds = new Set<string>();
  private _pendingDiscs   = new Map<string, any>();
  private _newDiscIds     = new Set<string>();
  private _selfActionIds  = new Set<string>();
  private _currentSlug    = '';

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass    = 'App--index';
    this._currentSlug = m.route.param('tags');
    this.loadTag(this._currentSlug);
  }

  onbeforeupdate() {
    const newSlug = m.route.param('tags');
    if (newSlug && newSlug !== this._currentSlug) {
      this._currentSlug  = newSlug;
      this.tag           = null;
      this.discussions   = [];
      this.hasMore       = false;
      this.offset        = 0;
      this.sort          = 'latest';
      this._pendingDiscs.clear();
      this._newDiscIds.clear();
      this.loadTag(newSlug);
    }
    return true;
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);

    // Filter broadcasts to those whose discussion belongs to the current tag.
    // The realtime payload only carries the Discussion (not the original event
    // metadata), so check the discussion's tag relationships directly.
    const belongsToCurrentTag = (disc: any): boolean => {
      const tagId = String(this.tag?.id?.() || '');
      if (!tagId) return false;
      const tags: any[] = disc?.tags?.() || [];
      return tags.some((t: any) => String(t?.id?.() || '') === tagId);
    };

    this._unbindRealtime = bindRealtime({
      onPost: (data: any) => {
        const disc = pushPayloadDiscussion(data);
        const id = disc?.id?.();
        if (!id || !belongsToCurrentTag(disc)) return;
        app.store
          .find('discussions', id, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
          .then((d: any) => {
            if (!d) return;
            const exists = this.discussions.some((x) => String(x.id?.() || '') === String(id));
            if (!exists) this._pendingDiscs.set(String(id), d);
            m.redraw();
          })
          .catch(() => { this._wsUpdates++; m.redraw(); });
      },

      onLike: (data: any) => {
        const disc = pushPayloadDiscussion(data);
        const id = disc?.id?.();
        if (!id || !belongsToCurrentTag(disc)) return;
        const sid = String(id);
        const isSelf = this._selfActionIds.has(sid);
        if (isSelf) this._selfActionIds.delete(sid);
        app.store
          .find('discussions', id, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
          .then(() => {
            if (!isSelf) {
              this._updatedLikeIds.add(sid);
              setTimeout(() => { this._updatedLikeIds.delete(sid); m.redraw(); }, 500);
            }
            m.redraw();
          })
          .catch(() => {});
      },

      onPinned: (data: any) => {
        const disc = pushPayloadDiscussion(data);
        const id = disc?.id?.();
        if (!id || !belongsToCurrentTag(disc)) return;
        app.store.find('discussions', id, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
          .then((d: any) => {
            if (!d) return;
            if (this.discussions.some((x) => String(x.id?.() || '') === String(id))) {
              this.discussions.sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
            }
            m.redraw();
          })
          .catch(() => {});
      },

      onPostRemoved: (data: any) => {
        const disc = pushPayloadDiscussion(data);
        const id = disc?.id?.();
        if (!id || !belongsToCurrentTag(disc)) return;
        // Only refetch if the discussion is currently rendered on this tag — avoids
        // wasted requests when a moderator hides a post in an unrelated tag.
        if (!this.discussions.some((x) => String(x.id?.() || '') === String(id))
            && !this._pendingDiscs.has(String(id))) return;
        app.store.find('discussions', id, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
          .then(() => m.redraw())
          .catch(() => {});
      },
    });
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    clearColor();
    this._unbindRealtime?.();
    this._unbindRealtime = null;
  }

  private loadTag(slug: string) {
    if (!slug) return;
    const cached = findTagBySlug(slug);
    if (cached) {
      this.tag = cached;
      if (app.forum.attribute('avocadoColoredEnabled')) applyColor(cached.color?.() || null);
      this.loadDiscussions(true);
      return;
    }
    this.tagLoading = true;
    app.store.find('tags', slug, { include: 'children,children.parent,parent' })
      .then(() => {
        this.tag = findTagBySlug(slug);
        this.tagLoading = false;
        if (this.tag) {
          if (app.forum.attribute('avocadoColoredEnabled')) applyColor(this.tag.color?.() || null);
          this.loadDiscussions(true);
        }
        m.redraw();
      })
      .catch(() => { this.tagLoading = false; m.redraw(); });
  }

  private getSortParam(): string {
    return SORT_OPTIONS.find((o) => o.key === this.sort)?.sort || '-lastPostedAt';
  }

  private loadDiscussions(reset: boolean) {
    if (this.loading || !this.tag) return;
    if (reset) { this.discussions = []; this.offset = 0; this.hasMore = false; }
    this.loading = true;
    app.store
      .find('discussions', {
        sort:    this.getSortParam(),
        page:    { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,firstPost,lastPostedUser,lastPost,tags',
        filter:  { tag: this.tag.slug() },
      })
      .then((results: any) => {
        const items    = Array.isArray(results) ? results : [];
        const combined = reset ? [...items] : [...this.discussions, ...items];
        combined.sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
        this.discussions = combined;
        this.hasMore     = !!(results.payload?.links?.next);
        this.offset     += items.length;
        this.loading     = false;
        m.redraw();
      })
      .catch(() => { this.loading = false; m.redraw(); });
  }

  private toggleLike(discussion: any) {
    const firstPost = discussion.firstPost?.();
    if (!firstPost) return;
    const id = discussion.id?.() as string;
    if (this.likingIds.has(id)) return;
    const likes   = firstPost.likes?.() || [];
    const isLiked = app.session.user && likes.some((u: any) => u === app.session.user);
    this.likingIds.add(id);
    this._selfActionIds.add(id);
    m.redraw();
    firstPost.save({ isLiked: !isLiked })
      .then(() => { this.likingIds.delete(id); m.redraw(); })
      .catch(() => { this.likingIds.delete(id); this._selfActionIds.delete(id); m.redraw(); });
  }

  private flushPending() {
    const pending = Array.from(this._pendingDiscs.values());
    this._pendingDiscs.clear();
    this._wsUpdates = 0;
    pending.forEach((disc) => {
      const discId = String(disc.id?.() || '');
      const existingIdx = this.discussions.findIndex((d) => String(d.id?.() || '') === discId);
      if (existingIdx >= 0) this.discussions.splice(existingIdx, 1);
      const insertPos = this.discussions.findIndex((d) => !d.isSticky?.());
      this.discussions.splice(insertPos >= 0 ? insertPos : 0, 0, disc);
      this._newDiscIds.add(discId);
    });
    m.redraw();
    setTimeout(() => { this._newDiscIds.clear(); m.redraw(); }, 4000);
  }

  view() {
    app.currentTag?.(true);

    if (this.tagLoading) {
      return (
        <div className="AvocadoTagPage">
          <div className="AvocadoTagPage-hero" style={{ '--tag-color': '#8f8f99' }}>
            <div className="AvocadoTagPage-hero-inner">
              <div className="AvocadoTagPage-hero-body">
                <div style={{ flex: 1 }}>
                  <div className="AvocadoTagsPage-shimmer AvocadoTagsPage-shimmer--name" style={{ width: '200px', height: '30px' }} />
                </div>
              </div>
            </div>
          </div>
          <div className="AvocadoTagPage-body">{renderThreadSkeleton()}</div>
        </div>
      );
    }

    if (!this.tag) {
      return (
        <div className="AvocadoTagPage">
          <div className="AvocadoTagPage-body">
            <div className="AvocadoDiscussions-empty">Tag not found.</div>
          </div>
        </div>
      );
    }

    const tag      = this.tag;
    const color    = tag.color?.()        || '';
    const tagName  = tag.name?.()         || '';
    const tagDesc  = tag.description?.()  || '';
    const tagIcon  = tag.icon?.()         || null;
    const count    = tag.discussionCount?.() || 0;
    const children = ((tag.children?.() || []) as any[]).filter(Boolean);
    const discHref = (() => { try { return app.route('avocado-discussions'); } catch { return '/discussions'; } })();

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
                  {count} {count === 1
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

              <button
                className="AvocadoTagPage-newBtn"
                onclick={() => {
                  if (!app.session.user) {
                    app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));
                    return;
                  }
                  const parent = tag.parent?.();
                  const selectedTags = parent ? [parent, tag] : [tag];
                  app.composer
                    .load(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/DiscussionComposer'), { user: app.session.user })
                    .then(() => { app.composer.fields.tags = selectedTags; app.composer.show(); m.redraw(); });
                }}
              >
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
              options={SORT_OPTIONS}
              currentKey={this.sort}
              onChange={(key: string) => { this.sort = key; this.loadDiscussions(true); }}
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
            pendingCount={this._pendingDiscs.size + this._wsUpdates}
            onFlush={() => this.flushPending()}
          />

          <div className="AvocadoHome-threadStack">
            {this.discussions.map((d) => (
              <ThreadCard
                key={d.id?.()}
                discussion={d}
                context={this}
                likingIds={this.likingIds}
                updatedLikeIds={this._updatedLikeIds}
                newDiscIds={this._newDiscIds}
                currentTag={this.tag}
                onToggleLike={(disc: any) => this.toggleLike(disc)}
              />
            ))}
            {this.loading && renderThreadSkeleton()}
            {!this.loading && this.discussions.length === 0 && renderEmpty('No discussions in this category yet.')}
          </div>

          {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadDiscussions(false))}
        </div>
      </div>
    );
  }
}
