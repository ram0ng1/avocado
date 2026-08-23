import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import Tooltip from 'flarum/common/components/Tooltip';
import listItems from 'flarum/common/helpers/listItems';
import abbreviateNumber from 'flarum/common/utils/abbreviateNumber';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import DiscussionListState from 'flarum/forum/states/DiscussionListState';
import PostListState from 'flarum/forum/states/PostListState';

import {
  tagRoute,
  safeRoute,
  displayName,
  truncate,
  highlight,
  numberOr,
  trans,
  FALLBACK_COLORS,
  FALLBACK_ICONS,
  navigate,
  renderDiscSkeleton,
  getFeaturedTagIds,
  resolveAssetUrl,
  categoryCardStyle,
} from '../utils';
import { toggleDiscussionLike } from '../utils/likes';
import { DISCUSSION_SEARCH_SORT, POST_SEARCH_SORT, getSortLabel } from '../utils/sortOptions';

import UserSearchState from '../states/UserSearchState';

import ThreadCard from './shared/ThreadCard';
import PostCard from './shared/PostCard';
import SortDropdown, { SortOption } from './shared/SortDropdown';

const TABS = ['discussions', 'posts', 'users'] as const;
type Tab = (typeof TABS)[number];

/**
 * AvocadoSearchPage — unified search route at `/search?q=…`.
 *
 * Coordinates three tabs:
 *  - **discussions** (DiscussionListState)
 *  - **posts** (PostListState)
 *  - **users** (manual paginated fetch — no core state class for users)
 *
 * Renders an empty hero with featured tags when the query is missing.
 */
export default class AvocadoSearchPage extends Page {
  static providesInitialSearch = true;

  private discussionsState!: DiscussionListState;
  private postsState!: PostListState;
  private usersState = new UserSearchState();
  private activeTab: Tab = 'discussions';
  private searchInputValue = '';
  private resultsKey = 0;
  private likingIds = new Set<string>();
  private selfActionIds = new Set<string>();
  private updatedLikeIds = new Set<string>();

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--search App--avocadoSearch';
    this.scrollTopOnCreate = false;

    app.current.set('routeName', 'avocado-search');

    this.searchInputValue = (app.search as any).state.params().q || '';
    this.activeTab = (m.route.param('tab') as Tab) || 'discussions';

    this.discussionsState = new DiscussionListState({});
    this.postsState = new PostListState({});

    const params = (app.search as any).state.params();
    const page = (m.route.param('page') && Number(m.route.param('page'))) || 1;
    if (params.q) this.loadTab(this.activeTab, params, page);

    app.history.push('search', 'Search');
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);
    const q = (app.search as any).state.params().q || '';
    app.setTitle(q ? `"${q}"` : trans('ramon-avocado.forum.search.title', 'Search'));
    app.setTitleCount(0);
  }

  // ── Tab orchestration ───────────────────────────────────────────────────────

  private switchTab(tab: Tab) {
    if (tab === this.activeTab) return;
    this.activeTab = tab;
    const params = (app.search as any).state.params();
    m.route.set(m.route.get(), { ...m.route.param(), tab }, { replace: true });
    this.loadTab(tab, params, 1);
  }

  private loadTab(tab: Tab, params: any, page = 1) {
    if (tab === 'discussions') {
      this.discussionsState.refreshParams(params, page);
    } else if (tab === 'posts') {
      this.postsState.refreshParams(params, page);
    } else if (tab === 'users') {
      if (!app.forum.attribute('canSearchUsers')) return;
      this.usersState.load(params.q || '', page);
    }
  }

  // ── View ────────────────────────────────────────────────────────────────────

  view() {
    const canSearchUsers = !!app.forum.attribute('canSearchUsers');
    const visibleTabs = TABS.filter((t) => t !== 'users' || canSearchUsers);
    let tab = this.activeTab;
    if (tab === 'users' && !canSearchUsers) {
      tab = 'discussions';
      this.activeTab = tab;
    }

    const q = ((app.search as any).state.params().q || '') as string;
    const hasQuery = !!q;

    return (
      <div className="AvocadoSearch AvocadoSearch--unified">
        <div key="nav" className="AvocadoNav-helper">
          <IndexSidebar />
        </div>

        {!hasQuery ? (
          this.renderEmptyState()
        ) : (
          <div key="body" className="AvocadoSearch-body">
            <div key="bar">{this.renderSearchBar(false)}</div>

            <div key="toolbar" className="AvocadoSearch-toolbar">
              <div className="AvocadoSearch-tabs" role="tablist">
                {visibleTabs.map((t) => this.renderTab(t, tab))}
              </div>
              {this.renderSortDropdown()}
            </div>

            <div key={`results-${this.resultsKey}-${tab}`} className="AvocadoSearch-tabContent AvocadoSearch-tabContent--animate" role="tabpanel">
              {tab === 'discussions' && this.renderDiscussionsTab()}
              {tab === 'posts' && this.renderPostsTab()}
              {tab === 'users' && canSearchUsers && this.renderUsersTab()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Tab buttons ────────────────────────────────────────────────────────────

  private renderTab(t: Tab, active: Tab) {
    const icon = t === 'discussions' ? 'far fa-comments' : t === 'posts' ? 'far fa-file-alt' : 'fas fa-users';
    const label =
      t === 'discussions'
        ? trans('ramon-avocado.forum.search.tab_discussions', 'Discussions')
        : t === 'posts'
          ? trans('ramon-avocado.forum.search.tab_posts', 'Posts')
          : trans('ramon-avocado.forum.search.tab_users', 'Users');

    return (
      <button
        key={t}
        role="tab"
        aria-selected={active === t}
        className={`AvocadoSearch-tab${active === t ? ' is-active' : ''}`}
        onclick={() => this.switchTab(t)}
      >
        <i className={icon} aria-hidden="true" />
        {label}
      </button>
    );
  }

  // ── Sort dropdown ──────────────────────────────────────────────────────────

  private renderSortDropdown() {
    const tab = this.activeTab;
    let sortMap: Record<string, string>;
    let sourceOptions: SortOption[];

    if (tab === 'discussions') {
      sortMap = this.discussionsState.sortMap() as Record<string, string>;
      sourceOptions = DISCUSSION_SEARCH_SORT;
    } else if (tab === 'posts') {
      sortMap = this.postsState.sortMap() as Record<string, string>;
      sourceOptions = POST_SEARCH_SORT;
    } else {
      return null;
    }

    const keys = Object.keys(sortMap);
    if (keys.length <= 1) return null;

    const currentKey = m.route.param('sort') || keys[0];
    const options: SortOption[] = keys.map((key) => ({
      key,
      label: sourceOptions.find((o) => o.key === key)?.label || (() => getSortLabel(key)),
    }));

    return (
      <SortDropdown
        options={options}
        currentKey={currentKey}
        onChange={(key: string) => {
          const params = { ...(app.search as any).state.params() };
          if (key === keys[0]) delete params.sort;
          else params.sort = key;
          m.route.set(app.route('avocado-search', params), null, { replace: true });
        }}
      />
    );
  }

  // ── Search bar ─────────────────────────────────────────────────────────────

  private renderSearchBar(hero = false) {
    const submit = () => {
      const q = (this.searchInputValue || '').trim();
      if (!q) return;
      this.resultsKey++;
      m.route.set(app.route('avocado-search', { q }), null, { replace: true });
    };

    return (
      <div className={`AvocadoSearch-barWrap${hero ? ' AvocadoSearch-barWrap--hero' : ''}`}>
        <div className="AvocadoSearch-bar">
          <i className="fas fa-search AvocadoSearch-barIcon" aria-hidden="true" />
          <input
            className="AvocadoSearch-barInput"
            type="search"
            placeholder={
              hero
                ? trans('ramon-avocado.forum.search.placeholder_hero', 'Search the forum…')
                : trans('ramon-avocado.forum.search.placeholder', 'Search…')
            }
            value={this.searchInputValue}
            oninput={(e: Event) => {
              this.searchInputValue = (e.target as HTMLInputElement).value;
              m.redraw();
            }}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            autofocus={hero}
          />
          {this.searchInputValue && (
            <button
              className="AvocadoSearch-barClear"
              aria-label={trans('ramon-avocado.forum.search.clear', 'Clear')}
              onclick={() => {
                this.searchInputValue = '';
                m.route.set(app.route('avocado-search'), null, { replace: true });
              }}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          )}
          <button className="AvocadoSearch-barBtn" disabled={!this.searchInputValue} onclick={submit}>
            {trans('ramon-avocado.forum.search.search_button', 'Search')}
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state hero ───────────────────────────────────────────────────────

  private renderEmptyState() {
    const tags = (app.store.all('tags') as any[]).filter((t) => t?.id?.() && !t.parent?.()).slice(0, 8);
    const featuredIds = getFeaturedTagIds();

    return (
      <div key="empty" className="AvocadoSearch-hero">
        <h1 className="AvocadoSearch-heroTitle">{trans('ramon-avocado.forum.search.hero_title', 'What are you looking for?')}</h1>
        <p className="AvocadoSearch-heroSub">{trans('ramon-avocado.forum.search.hero_sub', 'Search discussions, posts and members')}</p>
        {this.renderSearchBar(true)}
        {tags.length > 0 && (
          <div className="AvocadoSearch-heroTags">
            {[...tags.map((tag: any, idx: number) => this.renderHeroTag(tag, idx, featuredIds)), this.renderAllCategoriesTile(tags.length)]}
          </div>
        )}
      </div>
    );
  }

  private renderHeroTag(tag: any, idx: number, featuredIds: Set<string>) {
    const color = tag.color?.() || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
    const icon = tag.icon?.() || FALLBACK_ICONS[idx % FALLBACK_ICONS.length];
    const href = tagRoute(tag);
    const isFeatured = featuredIds.has(String(tag.id?.()));

    return (
      <a
        key={tag.id?.()}
        className={`AvocadoHome-categoryCard${isFeatured ? ' AvocadoHome-categoryCard--featured' : ''}`}
        href={href}
        onclick={(e: Event) => navigate(e as MouseEvent, href)}
        style={categoryCardStyle(color)}
      >
        {isFeatured && (
          <Tooltip text={trans('ramon-avocado.forum.tags.featured', 'Featured')} position="top">
            <span className="AvocadoHome-featuredBadge">
              <img src={resolveAssetUrl('fire.webp') || ''} alt="" aria-hidden="true" width="18" height="18" />
            </span>
          </Tooltip>
        )}
        <span className="AvocadoHome-categoryIcon">
          <i className={icon} aria-hidden="true" />
        </span>
        <div className="AvocadoHome-categoryBody">
          <h3>{tag.name?.()}</h3>
          <p>
            {abbreviateNumber(numberOr(tag.discussionCount?.(), 0))}{' '}
            {tag.discussionCount?.() === 1
              ? trans('ramon-avocado.forum.home.discussion_singular', 'discussion')
              : trans('ramon-avocado.forum.home.discussions', 'discussions')}
          </p>
        </div>
      </a>
    );
  }

  private renderAllCategoriesTile(shownCount: number) {
    const totalRoots = (app.store.all('tags') as any[]).filter((t) => t && !t.parent?.()).length;
    const extraCount = Math.max(0, totalRoots - shownCount);

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

  // ── Tab content ────────────────────────────────────────────────────────────

  private renderDiscussionsTab() {
    const state = this.discussionsState;
    const isLoading = state.isInitialLoading() || state.isLoadingNext();
    const items = state
      .getPages()
      .flatMap((pg: any) => pg.items)
      .filter((d: any) => d.id?.()) as any[];
    const q = ((app.search as any).state.params().q || '') as string;

    if (isLoading && items.length === 0) {
      return <div className="AvocadoSearch-stack">{renderDiscSkeleton()}</div>;
    }

    if (items.length === 0) {
      return (
        <div className="AvocadoSearch-empty">
          <i className="far fa-frown-open" aria-hidden="true" />
          <p>
            {q
              ? trans('ramon-avocado.forum.search.no_discussions_query', 'No discussions found for "{q}".', { q })
              : trans('ramon-avocado.forum.search.no_discussions_filter', 'No discussions match these filters.')}
          </p>
        </div>
      );
    }

    return (
      <div className="AvocadoSearch-stack">
        {items.map((d: any) => (
          <ThreadCard
            key={d.id?.()}
            discussion={d}
            context={this}
            likingIds={this.likingIds}
            updatedLikeIds={this.updatedLikeIds}
            onToggleLike={(disc: any) => toggleDiscussionLike(disc, this.likingIds, this.selfActionIds)}
            searchQuery={q}
          />
        ))}
        {isLoading && renderDiscSkeleton()}
        {!isLoading && state.hasNext() && (
          <div className="AvocadoDiscussions-loadMore">
            <button className="AvocadoDiscussions-loadMoreBtn" onclick={() => state.loadNext()}>
              {trans('ramon-avocado.forum.discussions.load_more', 'Load more')}
            </button>
          </div>
        )}
      </div>
    );
  }

  private renderPostsTab() {
    const state = this.postsState;
    const isLoading = state.isInitialLoading() || state.isLoadingNext();
    const allPosts = state
      .getPages()
      .flatMap((pg: any) => pg.items)
      .filter((p: any) => p.id?.()) as any[];
    const q = ((app.search as any).state.params().q || '') as string;

    if (isLoading && allPosts.length === 0) {
      return <div className="AvocadoSearch-stack">{renderDiscSkeleton()}</div>;
    }

    if (allPosts.length === 0) {
      return (
        <div className="AvocadoSearch-empty">
          <i className="far fa-frown-open" aria-hidden="true" />
          <p>
            {q
              ? trans('ramon-avocado.forum.search.no_posts_found', 'No posts found for "{q}".', { q })
              : trans('ramon-avocado.forum.search.no_posts_match', 'No posts match these filters.')}
          </p>
        </div>
      );
    }

    return (
      <div className="AvocadoSearch-stack">
        {allPosts.map((post: any) => (
          <PostCard key={post.id?.()} post={post} context={this} searchQuery={q} showBadges={false} />
        ))}
        {isLoading && renderDiscSkeleton()}
        {!isLoading && state.hasNext() && (
          <div className="AvocadoDiscussions-loadMore">
            <button className="AvocadoDiscussions-loadMoreBtn" onclick={() => state.loadNext()}>
              {trans('ramon-avocado.forum.discussions.load_more', 'Load more')}
            </button>
          </div>
        )}
      </div>
    );
  }

  private renderUsersTab() {
    const q = ((app.search as any).state.params().q || '') as string;
    const { users, loading, hasMore } = this.usersState;

    if (this.usersState.isInitialLoading()) {
      return <div className="AvocadoSearch-userStack">{this.renderUserSkeleton()}</div>;
    }

    if (!loading && users.length === 0) {
      return (
        <div className="AvocadoSearch-empty">
          <i className="far fa-frown-open" aria-hidden="true" />
          <p>
            {q
              ? trans('ramon-avocado.forum.search.no_users_found', 'No users found for "{q}".', { q })
              : trans('ramon-avocado.forum.search.enter_search_term', 'Enter a search term to find users.')}
          </p>
        </div>
      );
    }

    return (
      <div className="AvocadoSearch-userStack">
        {users.map((u: any) => this.renderUserCard(u))}
        {loading && this.renderUserSkeleton()}
        {!loading && hasMore && (
          <div className="AvocadoDiscussions-loadMore">
            <button className="AvocadoDiscussions-loadMoreBtn" onclick={() => this.usersState.loadNext()}>
              {trans('ramon-avocado.forum.discussions.load_more', 'Load more')}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── User card + skeleton ───────────────────────────────────────────────────

  private renderUserCard(user: any) {
    const username = (user.username?.() || '') as string;
    const dname = displayName(user);
    const href = (() => {
      try {
        return app.route('user', { username });
      } catch {
        return '#';
      }
    })();
    const bio = (user.bio?.() || '') as string;
    const q = (app.search as any).state.params().q || '';
    const postCount = numberOr(user.commentCount?.(), 0);
    const discussionCount = numberOr(user.discussionCount?.(), 0);
    const joinTime = user.joinTime?.();
    const joinLabel = joinTime ? new Date(joinTime as string).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : null;
    const badges = user.badges?.()?.toArray?.() ?? [];

    return (
      <article key={user.id()} className="AvocadoSearch-userCard">
        <div className="AvocadoSearch-userCard-head">
          <a
            className="AvocadoSearch-userCard-avatar"
            href={href}
            onclick={(e: Event) => {
              e.stopPropagation();
              navigate(e as MouseEvent, href);
            }}
            aria-hidden="true"
            tabIndex={-1}
          >
            <Avatar user={user} />
          </a>
          <div className="AvocadoSearch-userCard-info">
            <a
              className="AvocadoSearch-userCard-name"
              href={href}
              onclick={(e: Event) => {
                e.stopPropagation();
                navigate(e as MouseEvent, href);
              }}
            >
              {q ? highlight(dname, q) : dname}
            </a>
            <span className="AvocadoSearch-userCard-handle">@{username}</span>
            {badges.length > 0 && <ul className="badges AvocadoSearch-userCard-badges">{listItems(badges)}</ul>}
          </div>
          <a
            className="AvocadoHome-replyBtn AvocadoSearch-userCard-viewBtn"
            href={href}
            onclick={(e: Event) => {
              e.stopPropagation();
              navigate(e as MouseEvent, href);
            }}
          >
            <i className="fas fa-arrow-right" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.view', 'View')}
          </a>
        </div>

        {bio && <p className="AvocadoSearch-userCard-bio">{truncate(bio, 140)}</p>}

        <div className="AvocadoSearch-userCard-stats">
          <span className="AvocadoSearch-userCard-stat">
            <i className="far fa-comment" aria-hidden="true" />
            {postCount === 1
              ? trans('ramon-avocado.forum.home.post_singular', '1 post')
              : trans('ramon-avocado.forum.home.post_plural', '{count} posts', { count: postCount })}
          </span>
          <span className="AvocadoSearch-userCard-stat">
            <i className="far fa-comments" aria-hidden="true" />
            {discussionCount === 1
              ? trans('ramon-avocado.forum.home.discussion_singular_card', '1 discussion')
              : trans('ramon-avocado.forum.home.discussion_plural_card', '{count} discussions', { count: discussionCount })}
          </span>
          {joinLabel && (
            <span className="AvocadoSearch-userCard-stat">
              <i className="far fa-calendar" aria-hidden="true" />
              {joinLabel}
            </span>
          )}
        </div>
      </article>
    );
  }

  private renderUserSkeleton() {
    return [0, 1, 2].map((i) => (
      <div key={String(i)} className="AvocadoSearch-userCard AvocadoSearch-userCard--skeleton">
        <div className="AvocadoSearch-userCard-head">
          <div className="AvocadoSearch-userCard-avatar AvocadoHome-skeletonAvatar" style={{ width: '44px', height: '44px' }} />
          <div className="AvocadoSearch-userCard-info">
            <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm" />
            <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md" />
          </div>
          <div className="AvocadoSearch-userCard-viewBtn AvocadoSearch-userCard-viewBtn--skel" aria-hidden="true">
            <i className="fas fa-arrow-right" />
            {trans('ramon-avocado.forum.home.view', 'View')}
          </div>
        </div>
        <div className="AvocadoSearch-userCard-stats">
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--stat" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--stat" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--stat" />
        </div>
      </div>
    ));
  }
}
