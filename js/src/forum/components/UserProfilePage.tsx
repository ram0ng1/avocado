import app from 'flarum/forum/app';
import UserPage from 'flarum/forum/components/UserPage';
import UserControls from 'flarum/forum/utils/UserControls';

import { renderThreadSkeleton, renderLoadMore, renderEmpty } from '../utils';
import { toggleDiscussionLike } from '../utils/likes';

import ThreadCard from './shared/ThreadCard';
import PostCard from './shared/PostCard';
import { buildHero, buildSidebar, buildUserPhoneNav } from './UserProfileBuilders';

const PAGE_SIZE = 20;

const findBySlug = (slug: string): any => {
  const lowered = slug.toLowerCase();
  return (
    app.store.all('users').find((u: any) => (u.slug?.() || '').toLowerCase() === lowered || (u.username?.() || '').toLowerCase() === lowered) || null
  );
};

// ─── Base page ────────────────────────────────────────────────────────────────

class AvocadoUserBase extends UserPage {
  protected userLoading = true;
  protected _user: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.userLoading = true;
    this.loadUser(m.route.param('username'));
  }

  loadUser(slug: string) {
    if (!slug) return;

    const cached = findBySlug(slug);
    if (cached?.joinTime?.()) {
      this.user = cached;
      app.current.set('user', cached);
      this.userLoading = false;
      this.onUserLoaded(cached);
      return;
    }

    app.store
      .find('users', slug, { bySlug: true })
      .then((user: any) => {
        this.user = user;
        app.current.set('user', user);
        this.userLoading = false;
        this.onUserLoaded(user);
        m.redraw();
      })
      .catch(() => {
        this.userLoading = false;
        m.redraw();
      });
  }

  onUserLoaded(_user: any) {}

  content(): any {
    return null;
  }

  view() {
    const user = (this as any).user;
    const isEditable = user && (user.canEdit?.() || user === app.session.user);
    const controls = user ? UserControls.controls(user, this).toArray() : [];

    return (
      <div className="AvocadoUserPage">
        <div className="AvocadoNav-helper">{buildUserPhoneNav(this)}</div>
        {buildHero(user, isEditable, controls)}
        {buildSidebar(this)}
        <div className="AvocadoUserPage-body">
          <div className="AvocadoUserPage-bodyInner">
            {this.userLoading ? <div className="AvocadoHome-threadStack">{renderThreadSkeleton()}</div> : this.content()}
          </div>
        </div>
      </div>
    );
  }
}

// ─── Posts page ───────────────────────────────────────────────────────────────

export class AvocadoUserPostsPage extends AvocadoUserBase {
  private posts: any[] = [];
  private loading = false;
  private hasMore = false;
  private offset = 0;

  oninit(vnode: any) {
    this.posts = [];
    this.loading = false;
    this.hasMore = false;
    this.offset = 0;
    super.oninit(vnode);
  }

  activeKey() {
    return 'posts';
  }
  onUserLoaded(user: any) {
    this._user = user;
    this.loadPosts(true);
  }

  loadPosts(reset: boolean) {
    const user = this._user;
    if (!user || this.loading) return;

    if (reset) {
      this.posts = [];
      this.offset = 0;
      this.hasMore = false;
    }
    this.loading = true;
    m.redraw();

    app.store
      .find('posts', {
        filter: { author: user.username(), type: 'comment' },
        sort: '-createdAt',
        page: { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,discussion,discussion.tags,discussion.firstPost',
      })
      .then((results: any) => {
        const items = Array.isArray(results) ? results : [];
        this.posts = reset ? [...items] : [...this.posts, ...items];
        this.hasMore = !!results.payload?.links?.next;
        this.offset += items.length;
        this.loading = false;
        m.redraw();
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.posts.map((p: any) => <PostCard key={p.id?.()} post={p} context={this} />).filter(Boolean)}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No posts yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}

// ─── Discussions page ─────────────────────────────────────────────────────────

export class AvocadoUserDiscussionsPage extends AvocadoUserBase {
  private discussions: any[] = [];
  private loading = false;
  private hasMore = false;
  private offset = 0;
  private likingIds = new Set<string>();

  oninit(vnode: any) {
    this.discussions = [];
    this.loading = false;
    this.hasMore = false;
    this.offset = 0;
    this.likingIds = new Set();
    super.oninit(vnode);
  }

  activeKey() {
    return 'discussions';
  }
  onUserLoaded(user: any) {
    this._user = user;
    this.loadDiscussions(true);
  }

  loadDiscussions(reset: boolean) {
    const user = this._user;
    if (!user || this.loading) return;

    if (reset) {
      this.discussions = [];
      this.offset = 0;
      this.hasMore = false;
    }
    this.loading = true;
    m.redraw();

    app.store
      .find('discussions', {
        filter: { author: user.username() },
        sort: '-createdAt',
        page: { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,firstPost,lastPostedUser,lastPost,tags',
      })
      .then((results: any) => {
        const items = Array.isArray(results) ? results : [];
        this.discussions = reset ? [...items] : [...this.discussions, ...items];
        this.hasMore = !!results.payload?.links?.next;
        this.offset += items.length;
        this.loading = false;
        m.redraw();
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.discussions.map((d: any) => (
          <ThreadCard
            key={d.id?.()}
            discussion={d}
            context={this}
            likingIds={this.likingIds}
            onToggleLike={(disc: any) => toggleDiscussionLike(disc, this.likingIds)}
          />
        ))}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.discussions.length === 0 && renderEmpty('No discussions yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadDiscussions(false))}
      </div>
    );
  }
}

// ─── Likes page ───────────────────────────────────────────────────────────────

export class AvocadoUserLikesPage extends AvocadoUserBase {
  private posts: any[] = [];
  private loading = false;
  private hasMore = false;
  private offset = 0;

  oninit(vnode: any) {
    this.posts = [];
    this.loading = false;
    this.hasMore = false;
    this.offset = 0;
    super.oninit(vnode);
  }

  activeKey() {
    return 'likes';
  }
  onUserLoaded(user: any) {
    this._user = user;
    this.loadPosts(true);
  }

  loadPosts(reset: boolean) {
    const user = this._user;
    if (!user || this.loading) return;

    if (reset) {
      this.posts = [];
      this.offset = 0;
      this.hasMore = false;
    }
    this.loading = true;
    m.redraw();

    app.store
      .find('posts', {
        filter: { type: 'comment', likedBy: user.id() },
        sort: '-createdAt',
        page: { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,discussion,discussion.tags,discussion.firstPost',
      })
      .then((results: any) => {
        const items = Array.isArray(results) ? results : [];
        this.posts = reset ? [...items] : [...this.posts, ...items];
        this.hasMore = !!results.payload?.links?.next;
        this.offset += items.length;
        this.loading = false;
        m.redraw();
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.posts.map((p: any) => <PostCard key={p.id?.()} post={p} context={this} />).filter(Boolean)}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No liked posts yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}

// ─── Mentions page ────────────────────────────────────────────────────────────

export class AvocadoUserMentionsPage extends AvocadoUserBase {
  private posts: any[] = [];
  private loading = false;
  private hasMore = false;
  private offset = 0;

  oninit(vnode: any) {
    this.posts = [];
    this.loading = false;
    this.hasMore = false;
    this.offset = 0;
    super.oninit(vnode);
  }

  activeKey() {
    return 'mentions';
  }
  onUserLoaded(user: any) {
    this._user = user;
    this.loadPosts(true);
  }

  loadPosts(reset: boolean) {
    const user = this._user;
    if (!user || this.loading) return;

    if (reset) {
      this.posts = [];
      this.offset = 0;
      this.hasMore = false;
    }
    this.loading = true;
    m.redraw();

    app.store
      .find('posts', {
        filter: { type: 'comment', mentioned: user.id() },
        sort: '-createdAt',
        page: { offset: this.offset, limit: PAGE_SIZE },
        include: 'user,discussion,discussion.tags,discussion.firstPost',
      })
      .then((results: any) => {
        const items = Array.isArray(results) ? results : [];
        this.posts = reset ? [...items] : [...this.posts, ...items];
        this.hasMore = !!results.payload?.links?.next;
        this.offset += items.length;
        this.loading = false;
        m.redraw();
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }

  content() {
    return (
      <div className="AvocadoHome-threadStack">
        {this.posts.map((p: any) => <PostCard key={p.id?.()} post={p} context={this} />).filter(Boolean)}
        {this.loading && renderThreadSkeleton()}
        {!this.loading && this.posts.length === 0 && renderEmpty('No mentions yet.')}
        {this.hasMore && !this.loading && renderLoadMore('Load more', () => this.loadPosts(false))}
      </div>
    );
  }
}
