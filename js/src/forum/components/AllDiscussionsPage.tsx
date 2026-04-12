// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import { trans, navigate, renderThreadSkeleton, renderLoadMore, renderEmpty } from '../utils';
import ThreadCard from './shared/ThreadCard';
import SortDropdown, { SortOption } from './shared/SortDropdown';
import WsUpdateBanner from './shared/WsUpdateBanner';

const SORT_OPTIONS: SortOption[] = [
  { key: 'latest',   label: () => trans('ramon-avocado.forum.search.sort_latest',   'Latest'),   sort: '-lastPostedAt' },
  { key: 'top',      label: () => trans('ramon-avocado.forum.search.sort_top',       'Top'),      sort: '-commentCount' },
  { key: 'newest',   label: () => trans('ramon-avocado.forum.search.sort_newest',   'Newest'),   sort: '-createdAt'    },
  { key: 'oldest',   label: () => trans('ramon-avocado.forum.search.sort_oldest',   'Oldest'),   sort: 'createdAt'     },
  { key: 'trending', label: () => trans('ramon-avocado.forum.home.sort_trending',   'Trending'), sort: '-lastPostedAt' },
];

const PAGE_SIZE = 20;

export default class AllDiscussionsPage extends Page {
  private discussions: any[] = [];
  private loading = false;
  private hasMore = false;
  private sort: string = 'latest';
  private offset = 0;
  private likingIds   = new Set<string>();
  private _wsUpdates  = 0;
  private _wsHandler: ((d: any) => void) | null = null;
  private _likeHandler: ((d: any) => void) | null = null;
  private _unlikeHandler: ((d: any) => void) | null = null;
  private _deletedHandler: ((d: any) => void) | null = null;
  private _pinnedHandler: ((d: any) => void) | null = null;
  private _updatedLikeIds = new Set<string>();
  private _pendingDiscs   = new Map<string, any>();
  private _newDiscIds     = new Set<string>();
  private _selfActionIds  = new Set<string>();

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--index';
    this.sort = m.route.param('sort') || 'latest';
    this.loadDiscussions(true);
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);
    if (!app.pusher) return;

    this._wsHandler = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
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
      if (!discId) return;
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
      if (!discId) return;
      if (!this.discussions.some((d) => String(d.id?.() || '') === discId) && !this._pendingDiscs.has(discId)) return;
      app.store.find('discussions', discId, { include: 'user,firstPost,lastPostedUser,lastPost,tags' })
        .then(() => m.redraw()).catch(() => {});
    };

    this._pinnedHandler = (data: any) => {
      const discId = String(data?.discussionId || '');
      if (!discId) return;
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

  private getSortParam(): string {
    return SORT_OPTIONS.find((o) => o.key === this.sort)?.sort || '-lastPostedAt';
  }

  private loadDiscussions(reset: boolean) {
    if (this.loading) return;
    if (reset) { this.discussions = []; this.offset = 0; this.hasMore = false; }
    this.loading = true;
    m.redraw();
    app.store
      .find('discussions', {
        sort: this.getSortParam(),
        page: { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,firstPost,lastPostedUser,lastPost,tags',
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
    const homeHref = app.route('index');

    return (
      <div className="AvocadoDiscussions">
        <div className="AvocadoNav-helper"><IndexSidebar /></div>

        <div className="AvocadoDiscussions-header">
          <h1 className="AvocadoDiscussions-title">
            {trans('ramon-avocado.forum.discussions.title', 'All discussions')}
          </h1>
          <div className="AvocadoDiscussions-controls">
            <SortDropdown
              options={SORT_OPTIONS}
              currentKey={this.sort}
              onChange={(key: string) => { this.sort = key; this.loadDiscussions(true); }}
            />
            <a
              className="AvocadoDiscussions-homeLink"
              href={homeHref}
              onclick={(e: Event) => navigate(e as MouseEvent, homeHref)}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
              {trans('ramon-avocado.forum.discussions.home', 'Home')}
            </a>
          </div>
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
              onToggleLike={(disc: any) => this.toggleLike(disc)}
            />
          ))}
          {this.loading && renderThreadSkeleton()}
          {!this.loading && this.discussions.length === 0 && renderEmpty(trans('ramon-avocado.forum.discussions.empty', 'No discussions found.'))}
        </div>

        {this.hasMore && !this.loading && renderLoadMore(
          trans('ramon-avocado.forum.discussions.load_more', 'Load more'),
          () => this.loadDiscussions(false)
        )}
      </div>
    );
  }
}
