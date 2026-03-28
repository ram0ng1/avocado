import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import Tooltip from 'flarum/common/components/Tooltip';
import listItems from 'flarum/common/helpers/listItems';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import DiscussionListState from 'flarum/forum/states/DiscussionListState';
import PostListState from 'flarum/forum/states/PostListState';
import extractText from 'flarum/common/utils/extractText';
import {
  hexToRgba,
  iconColors,
  tagPillStyle,
  discussionRoute,
  tagRoute,
  safeRoute,
  displayName,
  formatTimeLabel,
  postPreview,
  truncate,
  highlight,
  numberOr,
  trans,
  FALLBACK_COLORS,
  FALLBACK_ICONS,
} from '../utils';

const DISC_SORT_LABELS = {
  relevance: 'Relevance',
  latest:    'Latest',
  top:       'Top',
  newest:    'Newest',
  oldest:    'Oldest',
};

const POST_SORT_LABELS = {
  relevance: 'Relevance',
  newest:    'Newest',
  oldest:    'Oldest',
};

const TABS = ['discussions', 'posts', 'users'];

// ─────────────────────────────────────────────────────────────────────────────
// AvocadoSearchPage
// Unified /search page with Discussions / Posts / Users tabs.
// ─────────────────────────────────────────────────────────────────────────────

export default class AvocadoSearchPage extends Page {
  static providesInitialSearch = true;

  oninit(vnode) {
    super.oninit(vnode);

    this.bodyClass = 'App--search App--avocadoSearch';
    this.scrollTopOnCreate = false;
    this.sortOpen = false;

    // Required by GlobalSearchState.changeSort() and clearInitialSearch()
    app.current.set('routeName', 'avocado-search');

    // Local state for the inline search bar
    this.searchInputValue = app.search.state.params().q || '';
    this._resultsKey = 0;

    // Like state — mirrors HomePage
    this.likingIds        = new Set();
    this._selfActionIds   = new Set();
    this._updatedLikeIds  = new Set();

    const params = app.search.state.params();
    const page   = (m.route.param('page') && Number(m.route.param('page'))) || 1;
    this.activeTab = m.route.param('tab') || 'discussions';

    // ── Discussions state ─────────────────────────────────────────────────
    this.discussionsState = new DiscussionListState({});

    // ── Posts state ───────────────────────────────────────────────────────
    this.postsState = new PostListState({});

    // ── Users state ───────────────────────────────────────────────────────
    this.users        = [];
    this.usersLoading = false;
    this.usersHasMore = false;
    this.usersPage    = 1;

    // Only load tab results when there is an actual query
    if (params.q) {
      this._loadTab(this.activeTab, params, page);
    }

    app.history.push('search', 'Search');
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    const q = app.search.state.params().q || '';
    app.setTitle(q ? `"${q}"` : 'Search');
    app.setTitleCount(0);
  }

  navigate(e, href) {
    e.preventDefault();
    m.route.set(href);
  }

  switchTab(tab) {
    if (tab === this.activeTab) return;
    this.activeTab = tab;
    this.sortOpen  = false;
    const params   = app.search.state.params();
    const current  = m.route.get();
    m.route.set(current, { ...m.route.param(), tab }, { replace: true });
    this._loadTab(tab, params, 1);
  }

  _loadTab(tab, params, page = 1) {
    if (tab === 'discussions') {
      this.discussionsState.refreshParams(params, page);
    } else if (tab === 'posts') {
      this.postsState.refreshParams(params, page);
    } else if (tab === 'users') {
      this._loadUsers(params.q || '', page);
    }
  }

  _loadUsers(q, page = 1) {
    if (!q) { this.users = []; m.redraw(); return; }
    this.usersLoading = true;
    this.usersPage    = page;
    m.redraw();
    app.store
      .find('users', {
        filter: { q },
        page:   { offset: (page - 1) * 20, limit: 20 },
      })
      .then((results) => {
        this.users        = page === 1 ? results : [...this.users, ...results];
        this.usersHasMore = results.length >= 20;
        this.usersLoading = false;
        m.redraw();
      })
      .catch(() => {
        this.usersLoading = false;
        m.redraw();
      });
  }

  // ── Like helpers (identical to HomePage) ─────────────────────────────────

  likesCount(discussion) {
    return numberOr(discussion.firstPost?.()?.attribute?.('likesCount'), 0);
  }

  replyCount(discussion) {
    return numberOr(discussion.replyCount?.(), 0);
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
    firstPost.save({ isLiked: !isLiked }).then(() => {
      this.likingIds.delete(id);
      m.redraw();
    }).catch(() => {
      this.likingIds.delete(id);
      this._selfActionIds.delete(id);
      m.redraw();
    });
  }

  renderAvatar(user) {
    if (!user) return null;
    return <Avatar user={user} title={displayName(user)} />;
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────

  renderDiscSkeleton() {
    return [0, 1, 2].map((i) => (
      <div key={String(i)} className="AvocadoHome-skeletonCard">
        <div className="AvocadoHome-skeletonAvatar" />
        <div className="AvocadoHome-skeletonBody">
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--lg" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md" />
        </div>
      </div>
    ));
  }

  renderPostSkeleton() {
    return [0, 1, 2].map((i) => (
      <div key={String(i)} className="AvocadoSearch-postSkeleton">
        <div className="AvocadoHome-skeletonAvatar" />
        <div className="AvocadoHome-skeletonBody">
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--lg" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm" style="width:28%" />
        </div>
      </div>
    ));
  }

  renderUserSkeleton() {
    return [0, 1, 2].map((i) => (
      <div key={String(i)} className="AvocadoSearch-userSkeleton">
        <div className="AvocadoSearch-userSkeletonAvatar" />
        <div className="AvocadoHome-skeletonBody">
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm" />
          <div className="AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md" />
        </div>
      </div>
    ));
  }

  // ── Discussion card (identical structure to HomePage.renderThreadCard) ─────

  renderReplyCard(discussion) {
    const lastPoster = discussion.lastPostedUser?.();
    const lastPost   = discussion.lastPost?.();
    const replies    = this.replyCount(discussion);
    if (!lastPoster && !lastPost) return null;

    const q          = app.search.state.params().q || '';
    const rawText    = lastPost?.contentPlain?.() || '';
    const preview    = rawText ? truncate(rawText, 100) : '';
    const otherCount = replies - 1;
    const href       = discussionRoute(discussion);
    const lastPostHref = (() => {
      try {
        const num = discussion.lastPostNumber?.();
        return num ? app.route.discussion(discussion, num) : href;
      } catch (_) { return href; }
    })();
    const secondPostHref = (() => {
      try { return app.route.discussion(discussion, 2); } catch (_) { return href; }
    })();

    return (
      <div className="AvocadoHome-replyCard">
        <a
          className="AvocadoHome-replyCard-line"
          href={lastPostHref}
          onclick={(e) => { e.stopPropagation(); this.navigate(e, lastPostHref); }}
        >
          <div className="AvocadoHome-replyCard-avatar">
            {this.renderAvatar(lastPoster)}
          </div>
          <span className="AvocadoHome-replyCard-name">{displayName(lastPoster)}</span>
          {preview && <span className="AvocadoHome-replyCard-text">{q ? highlight(preview, q, 100) : preview}</span>}
        </a>
        {otherCount > 0 && (
          <a
            className="AvocadoHome-replyCard-seeMore"
            href={secondPostHref}
            onclick={(e) => { e.stopPropagation(); this.navigate(e, secondPostHref); }}
          >
            {otherCount === 1
              ? trans('ramon-avocado.forum.home.see_other_reply_singular', 'See other {count} reply', { count: otherCount })
              : trans('ramon-avocado.forum.home.see_other_replies', 'See other {count} replies', { count: otherCount })}
          </a>
        )}
      </div>
    );
  }

  renderDiscussionCard(discussion) {
    const id          = discussion.id?.();
    const user        = discussion.user?.();
    const title       = discussion.title?.() || trans('ramon-avocado.forum.home.untitled', 'Untitled');
    const href        = discussionRoute(discussion);
    const tags        = (discussion.tags?.() || []).filter(Boolean);
    const isSticky    = discussion.isSticky?.() || false;
    const isFollowing = discussion.subscription?.() === 'follow';
    const isUnread    = discussion.isUnread?.() || false;
    const replies     = this.replyCount(discussion);
    const likes       = this.likesCount(discussion);
    const isLiked     = app.session.user && (discussion.firstPost?.()?.likes?.() || []).some((u) => u === app.session.user);
    const isLiking    = this.likingIds.has(id);
    const q           = app.search.state.params().q || '';
    const excerpt     = postPreview(discussion);
    const timeLabel   = formatTimeLabel(discussion.lastPostedAt?.());
    const userProfileHref = (() => {
      if (!user) return '#';
      try { return app.route('user', { username: user.username?.() || '' }); } catch (_) { return '#'; }
    })();

    return (
      <article key={id} className={`AvocadoHome-threadCard${isUnread ? ' AvocadoHome-threadCard--unread' : ''}`}>
        <div className="AvocadoHome-threadHead">
          <div className="AvocadoHome-avatarWrap">
            {this.renderAvatar(user)}
          </div>
          <div className="AvocadoHome-threadMain">
            <div className="AvocadoHome-threadMeta">
              <a
                className="AvocadoHome-threadAuthor"
                href={userProfileHref}
                onclick={(e) => { e.stopPropagation(); this.navigate(e, userProfileHref); }}
              >{displayName(user)}</a>
              {timeLabel && <span className="AvocadoHome-threadTime">{timeLabel}</span>}
              {isSticky && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--sticky" role="img" aria-label={trans('ramon-avocado.forum.home.badge_sticky', 'Pinned')}>
                    <i className="fas fa-thumbtack" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {isFollowing && (
                <Tooltip text={trans('ramon-avocado.forum.home.badge_following', 'Following')} position="top">
                  <span className="AvocadoHome-badge AvocadoHome-badge--following" role="img" aria-label={trans('ramon-avocado.forum.home.badge_following', 'Following')}>
                    <i className="fas fa-star" aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
              {tags.slice(0, 4).map((tag, idx) => {
                const tagColor   = tag.color?.() || null;
                const extraClass = idx >= 2 ? ' AvocadoHome-tagPill--extra' : '';
                const tagStyle   = tagPillStyle(tagColor);
                return (
                  <a
                    className={`AvocadoHome-tagPill${extraClass}`}
                    href={tagRoute(tag)}
                    onclick={(e) => { e.stopPropagation(); this.navigate(e, tagRoute(tag)); }}
                    style={tagStyle}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                  </a>
                );
              })}
              {tags.length > 2 && (
                <span className="AvocadoHome-tagMore">+{tags.length - 2}</span>
              )}
            </div>
            <a
              className="AvocadoHome-threadTitle"
              href={href}
              onclick={(e) => this.navigate(e, href)}
            >
              {q ? highlight(title, q) : title}
            </a>
            {excerpt && (
              <p className="AvocadoHome-threadExcerpt">
                {q ? highlight(excerpt, q, 160) : excerpt}
              </p>
            )}
          </div>
          <button
            className="AvocadoHome-replyBtn"
            aria-label={trans('ramon-avocado.forum.home.reply_label', 'Reply')}
            onclick={(e) => {
              e.stopPropagation();
              if (!app.session.user) {
                app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default));
                return;
              }
              import('flarum/forum/components/ReplyComposer').then(({ default: ReplyComposer }) => {
                if (app.composer) {
                  app.composer.load(ReplyComposer, { user: app.session.user, discussion });
                  app.composer.show();
                }
                m.route.set(href);
              });
            }}
          >
            <i className="fas fa-reply" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.reply_label', 'Reply')}
          </button>
        </div>
        {replies > 0 && (
          <div className="AvocadoHome-threadReplyGroup">
            {this.renderReplyCard(discussion)}
          </div>
        )}
        <div className="AvocadoHome-threadStats">
          <button
            className={`AvocadoHome-statBtn AvocadoHome-statBtn--likes${isLiked ? ' AvocadoHome-statBtn--liked' : ''}${isLiking ? ' AvocadoHome-statBtn--loading' : ''}${this._updatedLikeIds.has(id) ? ' AvocadoHome-statBtn--pop' : ''}`}
            onclick={(e) => {
              e.stopPropagation();
              if (!app.session.user) {
                app.modal.show(() => import('flarum/forum/components/LogInModal').then((m) => m.default));
                return;
              }
              this.toggleLike(discussion);
            }}
            title={trans('ramon-avocado.forum.home.like', 'Like')}
          >
            <i className={isLiked ? 'fas fa-thumbs-up' : 'far fa-thumbs-up'} aria-hidden="true" />
            <span>{likes === 1
              ? trans('ramon-avocado.forum.home.like_count_singular', '1 like')
              : trans('ramon-avocado.forum.home.like_count_plural', '{count} likes', { count: likes })}</span>
          </button>
          <button
            className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
            onclick={(e) => { e.stopPropagation(); m.route.set(href); }}
            title={trans('ramon-avocado.forum.home.replies', 'Replies')}
          >
            <i className="far fa-comment" aria-hidden="true" />
            <span>{replies === 1
              ? trans('ramon-avocado.forum.home.reply_count_singular', '1 resposta')
              : trans('ramon-avocado.forum.home.reply_count_plural', '{count} respostas', { count: replies })}</span>
          </button>
        </div>
      </article>
    );
  }

  // ── Post card (same structure as UserProfilePage post card) ─────────────

  renderPostCard(post) {
    if (!post) return null;
    const q          = app.search.state.params().q || '';
    const discussion = post.discussion?.();
    const user       = post.user?.();
    if (!discussion) return null;

    const id       = post.id?.();
    const title    = discussion.title?.() || trans('ramon-avocado.forum.home.untitled', 'Untitled');
    const postNum  = post.number?.();
    const href     = (() => { try { return app.route.discussion(discussion, postNum); } catch (_) { return discussionRoute(discussion); } })();
    const tags     = (discussion.tags?.() || []).filter(Boolean);
    const timeLabel = formatTimeLabel(post.createdAt?.());
    const userProfileHref = (() => {
      if (!user) return '#';
      try { return app.route('user', { username: user.username?.() || '' }); } catch (_) { return '#'; }
    })();
    const plain   = post.contentPlain?.() || '';
    const excerpt = plain ? (q ? highlight(plain, q, 200) : truncate(plain, 200)) : null;
    const replies = numberOr(discussion.replyCount?.(), 0);

    return (
      <article key={id} className="AvocadoHome-threadCard">
        <div className="AvocadoHome-threadHead">
          <div className="AvocadoHome-avatarWrap">
            {this.renderAvatar(user)}
          </div>
          <div className="AvocadoHome-threadMain">
            <div className="AvocadoHome-threadMeta">
              <a
                className="AvocadoHome-threadAuthor"
                href={userProfileHref}
                onclick={(e) => { e.stopPropagation(); this.navigate(e, userProfileHref); }}
              >{displayName(user)}</a>
              {timeLabel && <span className="AvocadoHome-threadTime">{timeLabel}</span>}
              {tags.slice(0, 2).map((tag) => {
                const tagColor = tag.color?.() || null;
                const tagStyle = tagColor ? { '--tag-bg': hexToRgba(tagColor, 0.1), '--tag-color': tagColor } : {};
                return (
                  <a
                    className="AvocadoHome-tagPill"
                    href={tagRoute(tag)}
                    onclick={(e) => { e.stopPropagation(); this.navigate(e, tagRoute(tag)); }}
                    style={tagStyle}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                  </a>
                );
              })}
            </div>
            <a
              className="AvocadoHome-threadTitle"
              href={href}
              onclick={(e) => this.navigate(e, href)}
            >
              {q ? highlight(title, q) : title}
            </a>
            {excerpt && (
              <p className="AvocadoHome-threadExcerpt AvocadoUserPage-postExcerpt">{excerpt}</p>
            )}
          </div>
          <a
            className="AvocadoHome-replyBtn"
            href={href}
            onclick={(e) => { e.stopPropagation(); this.navigate(e, href); }}
          >
            <i className="fas fa-arrow-right" aria-hidden="true" />
            View
          </a>
        </div>
        <div className="AvocadoHome-threadStats">
          <span
            className="AvocadoHome-statBtn AvocadoHome-statBtn--replies"
            onclick={(e) => { e.stopPropagation(); m.route.set(href); }}
          >
            <i className="far fa-comment" aria-hidden="true" />
            <span>{replies === 1 ? '1 reply' : `${replies} replies`}</span>
          </span>
        </div>
      </article>
    );
  }

  // ── User card ─────────────────────────────────────────────────────────────

  renderUserCard(user) {
    const username  = user.username?.() || '';
    const dname     = displayName(user);
    const href      = (() => { try { return app.route('user', { username }); } catch (_) { return '#'; } })();
    const bio       = user.bio?.() || '';
    const q         = app.search.state.params().q || '';
    const postCount = numberOr(user.commentCount?.(), 0);
    const discussionCount = numberOr(user.discussionCount?.(), 0);
    const joinTime  = user.joinTime?.();
    const joinLabel = joinTime
      ? new Date(joinTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
      : null;

    return (
      <article key={user.id()} className="AvocadoSearch-userCard">
        <div className="AvocadoSearch-userCard-head">
          <a
            className="AvocadoSearch-userCard-avatar"
            href={href}
            onclick={(e) => { e.stopPropagation(); this.navigate(e, href); }}
            aria-hidden="true"
            tabIndex={-1}
          >
            <Avatar user={user} />
          </a>
          <div className="AvocadoSearch-userCard-info">
            <a
              className="AvocadoSearch-userCard-name"
              href={href}
              onclick={(e) => { e.stopPropagation(); this.navigate(e, href); }}
            >
              {q ? highlight(dname, q) : dname}
            </a>
            <span className="AvocadoSearch-userCard-handle">@{username}</span>
            {(() => {
              const badges = user.badges?.()?.toArray?.() ?? [];
              return badges.length > 0
                ? <ul className="badges AvocadoSearch-userCard-badges">{listItems(badges)}</ul>
                : null;
            })()}
          </div>
          <a
            className="AvocadoHome-replyBtn AvocadoSearch-userCard-viewBtn"
            href={href}
            onclick={(e) => { e.stopPropagation(); this.navigate(e, href); }}
          >
            <i className="fas fa-arrow-right" aria-hidden="true" />
            View
          </a>
        </div>
        {bio && (
          <p className="AvocadoSearch-userCard-bio">{truncate(bio, 140)}</p>
        )}
        <div className="AvocadoSearch-userCard-stats">
          <span className="AvocadoSearch-userCard-stat">
            <i className="far fa-comment" aria-hidden="true" />
            {postCount === 1 ? '1 post' : `${postCount} posts`}
          </span>
          <span className="AvocadoSearch-userCard-stat">
            <i className="far fa-comments" aria-hidden="true" />
            {discussionCount === 1 ? '1 discussion' : `${discussionCount} discussions`}
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

  // ── Sort dropdown (matches AvocadoDiscussions-sortTrigger style) ─────────

  renderSortDropdown() {
    const tab = this.activeTab;
    let sortMap, labels;

    if (tab === 'discussions') {
      sortMap = this.discussionsState.sortMap();
      labels  = DISC_SORT_LABELS;
    } else if (tab === 'posts') {
      sortMap = this.postsState.sortMap();
      labels  = POST_SORT_LABELS;
    } else {
      return null;
    }

    const keys = Object.keys(sortMap);
    if (keys.length <= 1) return null;

    const currentSort = m.route.param('sort') || keys[0];
    const currentLabel = labels[currentSort] || currentSort;

    const setSort = (key) => {
      this.sortOpen = false;
      const params = { ...app.search.state.params() };
      if (key === keys[0]) {
        delete params.sort;
      } else {
        params.sort = key;
      }
      m.route.set(app.route('avocado-search', params));
    };

    return (
      <div className="AvocadoDiscussions-sortWrap">
        <button
          className={`AvocadoDiscussions-sortTrigger${this.sortOpen ? ' is-open' : ''}`}
          onclick={() => { this.sortOpen = !this.sortOpen; m.redraw(); }}
        >
          {currentLabel}
          <i className={`fas fa-chevron-${this.sortOpen ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
        {this.sortOpen && (
          <div className="AvocadoDiscussions-sortDropdown">
            {keys.map((key) => (
              <button
                key={key}
                className={`AvocadoDiscussions-sortOption${currentSort === key ? ' is-active' : ''}`}
                onclick={() => setSort(key)}
              >
                <span className="AvocadoDiscussions-sortOption-check">
                  {currentSort === key && <i className="fas fa-check" aria-hidden="true" />}
                </span>
                {labels[key] || key}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Search bar ────────────────────────────────────────────────────────────

  renderSearchBar(hero = false) {
    const submit = () => {
      const q = (this.searchInputValue || '').trim();
      if (!q) return;
      this._resultsKey++;
      m.route.set(app.route('avocado-search', { q }));
    };

    return (
      <div className={`AvocadoSearch-barWrap${hero ? ' AvocadoSearch-barWrap--hero' : ''}`}>
        <div className="AvocadoSearch-bar">
          <i className="fas fa-search AvocadoSearch-barIcon" aria-hidden="true" />
          <input
            className="AvocadoSearch-barInput"
            type="search"
            placeholder={hero ? 'Search the forum…' : 'Search…'}
            value={this.searchInputValue}
            oninput={(e) => { this.searchInputValue = e.target.value; m.redraw(); }}
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            autofocus={hero}
          />
          {this.searchInputValue && (
            <button
              className="AvocadoSearch-barClear"
              aria-label="Clear"
              onclick={() => {
                this.searchInputValue = '';
                m.route.set(app.route('avocado-search'));
              }}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          )}
          <button
            className="AvocadoSearch-barBtn"
            disabled={!this.searchInputValue}
            onclick={submit}
          >
            Search
          </button>
        </div>
      </div>
    );
  }

  renderEmptyState() {
    const tags = app.store.all('tags').filter((t) => t && !t.parent?.()).slice(0, 8);
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

    return (
      <div className="AvocadoSearch-hero">
        <h1 className="AvocadoSearch-heroTitle">
          {trans('ramon-avocado.forum.search.hero_title', 'What are you looking for?')}
        </h1>
        <p className="AvocadoSearch-heroSub">
          {trans('ramon-avocado.forum.search.hero_sub', 'Search discussions, posts and members')}
        </p>

        {this.renderSearchBar(true)}

        {tags.length > 0 && (
          <div className="AvocadoSearch-heroTags">
            {tags.map((tag, idx) => {
              const color = tag.color?.() || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
              const icon  = tag.icon?.() || FALLBACK_ICONS[idx % FALLBACK_ICONS.length];
              const href  = tagRoute(tag);
              const isFeatured = featuredIds.has(String(tag.id?.()));
              return (
                <a
                  key={tag.id?.()}
                  className={`AvocadoHome-categoryCard${isFeatured ? ' AvocadoHome-categoryCard--featured' : ''}`}
                  href={href}
                  onclick={(e) => this.navigate(e, href)}
                  style={(() => { const ic = iconColors(color, 0.12); return { '--cat-color': ic.color, '--cat-bg': ic.bg }; })()}
                >
                  {isFeatured && (
                    <Tooltip text={trans('ramon-avocado.forum.tags.featured', 'Featured')} position="top">
                      <span className="AvocadoHome-featuredBadge">
                        <img src={fireUrl} alt="" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  <span className="AvocadoHome-categoryIcon">
                    <i className={icon} aria-hidden="true" />
                  </span>
                  <div className="AvocadoHome-categoryBody">
                    <h3>{tag.name?.()}</h3>
                    <p>{numberOr(tag.discussionCount?.(), 0)} {trans('ramon-avocado.forum.home.discussions', 'discussions')}</p>
                  </div>
                </a>
              );
            })}
            <a
              className="AvocadoHome-categoryCard AvocadoHome-categoryCard--all"
              href={safeRoute('tags')}
              onclick={(e) => this.navigate(e, safeRoute('tags'))}
            >
              <div className="AvocadoHome-categoryBody">
                <h3>{trans('ramon-avocado.forum.home.all_categories', 'All categories')}</h3>
                <p>{Math.max(0, app.store.all('tags').filter((t) => t && !t.parent?.()).length - tags.length)} {trans('ramon-avocado.forum.home.more', 'more')}</p>
              </div>
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </a>
          </div>
        )}

      </div>
    );
  }

  // ── Tab content ───────────────────────────────────────────────────────────

  renderDiscussionsTab() {
    const state     = this.discussionsState;
    const isLoading = state.isInitialLoading() || state.isLoadingNext();
    const items     = state.getPages().flatMap((pg) => pg.items);
    const q         = app.search.state.params().q || '';

    if (isLoading && items.length === 0) {
      return <div className="AvocadoSearch-stack">{this.renderDiscSkeleton()}</div>;
    }
    if (items.length === 0) {
      return (
        <div className="AvocadoSearch-empty">
          <i className="far fa-frown-open" aria-hidden="true" />
          <p>{q ? `No discussions found for "${q}".` : 'No discussions match these filters.'}</p>
        </div>
      );
    }
    return (
      <div className="AvocadoSearch-stack">
        {items.map((d) => this.renderDiscussionCard(d))}
        {isLoading && this.renderDiscSkeleton()}
        {!isLoading && state.hasNext() && (
          <div key="load-more" className="AvocadoDiscussions-loadMore">
            <button
              className="AvocadoDiscussions-loadMoreBtn"
              onclick={() => state.loadNext()}
            >
              Load more
            </button>
          </div>
        )}
      </div>
    );
  }

  renderPostsTab() {
    const state     = this.postsState;
    const isLoading = state.isInitialLoading() || state.isLoadingNext();
    const allPosts  = state.getPages().flatMap((pg) => pg.items);
    const q         = app.search.state.params().q || '';

    if (isLoading && allPosts.length === 0) {
      return <div className="AvocadoSearch-postStack">{this.renderPostSkeleton()}</div>;
    }
    if (allPosts.length === 0) {
      return (
        <div className="AvocadoSearch-empty">
          <i className="far fa-frown-open" aria-hidden="true" />
          <p>{q ? `No posts found for "${q}".` : 'No posts match these filters.'}</p>
        </div>
      );
    }
    return (
      <div className="AvocadoSearch-stack">
        {allPosts.map((post) => this.renderPostCard(post))}
        {isLoading && this.renderDiscSkeleton()}
        {!isLoading && state.hasNext() && (
          <div key="load-more" className="AvocadoDiscussions-loadMore">
            <button
              className="AvocadoDiscussions-loadMoreBtn"
              onclick={() => state.loadNext()}
            >
              Load more
            </button>
          </div>
        )}
      </div>
    );
  }

  renderUsersTab() {
    const q = app.search.state.params().q || '';

    if (this.usersLoading && this.users.length === 0) {
      return <div className="AvocadoSearch-userStack">{this.renderUserSkeleton()}</div>;
    }
    if (!this.usersLoading && this.users.length === 0) {
      return (
        <div className="AvocadoSearch-empty">
          <i className="far fa-frown-open" aria-hidden="true" />
          <p>{q ? `No users found for "${q}".` : 'Enter a search term to find users.'}</p>
        </div>
      );
    }
    return (
      <div className="AvocadoSearch-userStack">
        {this.users.map((u) => this.renderUserCard(u))}
        {this.usersLoading && this.renderUserSkeleton()}
        {!this.usersLoading && this.usersHasMore && (
          <div key="load-more" className="AvocadoDiscussions-loadMore">
            <button
              className="AvocadoDiscussions-loadMoreBtn"
              onclick={() => this._loadUsers(q, this.usersPage + 1)}
            >
              Load more
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── View ──────────────────────────────────────────────────────────────────

  view() {
    const tab      = this.activeTab;
    const q        = app.search.state.params().q || '';
    const hasQuery = !!q;

    return (
      <div className="AvocadoSearch AvocadoSearch--unified">
        <div className="AvocadoNav-helper"><IndexSidebar /></div>

        {!hasQuery ? this.renderEmptyState() : (
          <div className="AvocadoSearch-body">
            <div key="bar">{this.renderSearchBar(false)}</div>

            <div key="toolbar" className="AvocadoSearch-toolbar">
              <div className="AvocadoSearch-tabs" role="tablist">
                {TABS.map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    className={`AvocadoSearch-tab${tab === t ? ' is-active' : ''}`}
                    onclick={() => this.switchTab(t)}
                  >
                    {t === 'discussions' ? <i className="far fa-comments" aria-hidden="true" />
                    : t === 'posts'       ? <i className="far fa-file-alt" aria-hidden="true" />
                    :                      <i className="fas fa-users" aria-hidden="true" />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              {this.renderSortDropdown()}
            </div>

            <div
              key={`results-${this._resultsKey}-${tab}`}
              className="AvocadoSearch-tabContent AvocadoSearch-tabContent--animate"
              role="tabpanel"
            >
              {tab === 'discussions' && this.renderDiscussionsTab()}
              {tab === 'posts'       && this.renderPostsTab()}
              {tab === 'users'       && this.renderUsersTab()}
            </div>
          </div>
        )}
      </div>
    );
  }
}
