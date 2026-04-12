// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import { trans, tagRoute, navigate, renderThreadSkeleton, renderLoadMore, renderEmpty } from '../utils';
import ThreadCard from './shared/ThreadCard';
import SortDropdown, { SortOption } from './shared/SortDropdown';
import WsUpdateBanner from './shared/WsUpdateBanner';

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
  private _wsHandler: ((d: any) => void) | null = null;
  private _likeHandler: ((d: any) => void) | null = null;
  private _unlikeHandler: ((d: any) => void) | null = null;
  private _deletedHandler: ((d: any) => void) | null = null;
  private _pinnedHandler: ((d: any) => void) | null = null;
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
    if (!app.pusher) return;

    const tagMatches = (data: any) => {
      if (!this.tag || !data?.tagIds) return true;
      const ids = (Array.isArray(data.tagIds) ? data.tagIds : Object.values(data.tagIds)) as any[];
      return ids.map(String).includes(String(this.tag.id?.() || ''));
    };

    this._wsHandler = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId || !tagMatches(data)) return;
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then((disc: any) => {
          if (!disc) return;
          const exists = this.discussions.some((d) => String(d.id?.() || '') === discId);
          if (exists) { m.redraw(); } else { this._pendingDiscs.set(discId, disc); m.redraw(); }
        })
        .catch(() => { this._wsUpdates++; m.redraw(); });
    };

    const handleLike = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId || !tagMatches(data)) return;
      const isSelf = this._selfActionIds.has(discId);
      if (isSelf) this._selfActionIds.delete(discId);
      app.store
        .find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then(() => {
          if (!isSelf) {
            this._updatedLikeIds.add(discId);
            setTimeout(() => { this._updatedLikeIds.delete(discId); m.redraw(); }, 500);
          }
          m.redraw();
        })
        .catch(() => {});
    };
    this._likeHandler   = handleLike;
    this._unlikeHandler = handleLike;

    this._deletedHandler = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId || !tagMatches(data)) return;
      if (!this.discussions.some((d) => String(d.id?.() || '') === discId) && !this._pendingDiscs.has(discId)) return;
      app.store.find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then(() => m.redraw()).catch(() => {});
    };

    this._pinnedHandler = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId || !tagMatches(data)) return;
      app.store.find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then((disc: any) => {
          if (!disc) return;
          if (this.discussions.some((d) => String(d.id?.() || '') === discId)) {
            this.discussions.sort((a, b) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
          }
          m.redraw();
        })
        .catch(() => {});
    };

    if (typeof app.pusher.then === 'function') {
      app.pusher.then(({ channels }: any) => {
        if (!channels?.main) return;
        channels.main.bind('newPost',          this._wsHandler);
        channels.main.bind('postLiked',        this._likeHandler);
        channels.main.bind('postUnliked',      this._unlikeHandler);
        channels.main.bind('postDeleted',      this._deletedHandler);
        channels.main.bind('discussionPinned', this._pinnedHandler);
      });
    }
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    if (!app.pusher || typeof app.pusher.then !== 'function') return;
    app.pusher.then(({ channels }: any) => {
      if (!channels?.main) return;
      if (this._wsHandler)      channels.main.unbind('newPost',          this._wsHandler);
      if (this._likeHandler)    channels.main.unbind('postLiked',        this._likeHandler);
      if (this._unlikeHandler)  channels.main.unbind('postUnliked',      this._unlikeHandler);
      if (this._deletedHandler) channels.main.unbind('postDeleted',      this._deletedHandler);
      if (this._pinnedHandler)  channels.main.unbind('discussionPinned', this._pinnedHandler);
    });
  }

  private loadTag(slug: string) {
    if (!slug) return;
    const cached = findTagBySlug(slug);
    if (cached) { this.tag = cached; this.loadDiscussions(true); return; }
    this.tagLoading = true;
    app.store.find('tags', slug, { include: 'children,children.parent,parent' })
      .then(() => {
        this.tag = findTagBySlug(slug);
        this.tagLoading = false;
        if (this.tag) this.loadDiscussions(true);
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
                  {count} {count === 1 ? 'discussion' : 'discussions'}
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
