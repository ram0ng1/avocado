import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import Dropdown from 'flarum/common/components/Dropdown';
import PostListState from 'flarum/forum/states/PostListState';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import extractText from 'flarum/common/utils/extractText';

import { trans, displayName, formatTimeLabel, truncate, highlight, navigate, userRoute, renderPostSkeleton, renderLoadMore } from '../utils';
import { POST_SEARCH_SORT, getSortLabel } from '../utils/sortOptions';

import SortDropdown, { SortOption } from './shared/SortDropdown';

/**
 * AvocadoPostsSearchPage — list view for `/posts?q=…`.
 *
 * Wraps Flarum's `PostListState` with a custom card layout, the shared
 * sort dropdown and the search-query highlight helper.
 */
export default class AvocadoPostsSearchPage extends Page {
  static providesInitialSearch = true;

  private postsState!: PostListState;

  oninit(vnode: any) {
    super.oninit(vnode);

    this.postsState = new PostListState({});
    this.postsState.refreshParams((app.search as any).state.params(), (m.route.param('page') && Number(m.route.param('page'))) || 1);

    app.history.push('posts', extractText(app.translator.trans('core.forum.header.back_to_index_tooltip')));
    this.bodyClass = 'App--posts App--avocadoSearch';
    this.scrollTopOnCreate = false;
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);
    app.setTitle(extractText(app.translator.trans('core.forum.posts.meta_title_text')));
    app.setTitleCount(0);
  }

  view() {
    const params = (app.search as any).state.params();
    const q = params.q || '';
    const state = this.postsState;
    const isLoading = state.isInitialLoading() || state.isLoadingNext();
    const allPosts = state.getPages().flatMap((pg: any) => pg.items) as any[];

    const sortMap = state.sortMap() as Record<string, string>;
    const currentKey = params.sort || Object.keys(sortMap)[0];
    const sortOpts: SortOption[] = Object.keys(sortMap).map((key) => ({
      key,
      label: POST_SEARCH_SORT.find((o) => o.key === key)?.label || (() => getSortLabel(key)),
    }));

    return (
      <div className="AvocadoSearch AvocadoSearch--posts">
        <div className="AvocadoNav-helper">
          <IndexSidebar />
        </div>

        <div className="AvocadoSearch-header">
          <h1 className="AvocadoSearch-title">{this.renderTitle()}</h1>
          {Object.keys(sortMap).length > 1 && (
            <SortDropdown
              options={sortOpts}
              currentKey={currentKey}
              onChange={(key: string) => {
                (app.search as any).state.changeSort(key);
                m.redraw();
              }}
            />
          )}
        </div>

        {isLoading && allPosts.length === 0 ? (
          <div className="AvocadoSearch-postStack">{renderPostSkeleton()}</div>
        ) : allPosts.length === 0 ? (
          <div className="AvocadoSearch-empty">
            <i className="far fa-frown-open" aria-hidden="true" />
            <p>
              {q
                ? trans('ramon-avocado.forum.search.no_posts_found', 'No posts found for "{q}".', { q })
                : trans('ramon-avocado.forum.search.no_posts_match', 'No posts match these filters.')}
            </p>
          </div>
        ) : (
          <div className="AvocadoSearch-postStack">
            {allPosts.map((post: any) => this.renderPostCard(post))}
            {isLoading && renderPostSkeleton()}
            {!isLoading && state.hasNext() && renderLoadMore(trans('ramon-avocado.forum.discussions.load_more', 'Load more'), () => state.loadNext())}
          </div>
        )}
      </div>
    );
  }

  // ── Subviews ────────────────────────────────────────────────────────────────

  private renderTitle() {
    const params = (app.search as any).state.params();
    const q = params.q || '';
    const filter = params.filter || {};

    if (q) {
      return (
        <>
          {trans('ramon-avocado.forum.search.posts_for', 'Posts for')} <span className="AvocadoSearch-query">"{q}"</span>
        </>
      );
    }

    const parts = Object.entries(filter as Record<string, string>)
      .filter(([k]) => !k.startsWith('-'))
      .map(([k, v]) => `${k}:${v}`);

    if (parts.length > 0) {
      return (
        <>
          {trans('ramon-avocado.forum.search.posts_filtered_by', 'Posts filtered by')} <span className="AvocadoSearch-query">{parts.join(', ')}</span>
        </>
      );
    }

    return trans('ramon-avocado.forum.search.posts_title', 'Posts search');
  }

  private renderPostCard(post: any) {
    const q = (app.search as any).state.params().q || '';
    const discussion = post.discussion?.();
    const user = post.user?.();
    const content = (post.contentPlain?.() || '') as string;
    const href = app.route.post(post);
    const userHref = userRoute(user);
    const timeLabel = formatTimeLabel(post.createdAt?.());
    const excerptNode = content ? (q ? highlight(content, q, 220) : truncate(content, 220)) : null;
    const discussionTitle = (discussion?.title?.() || '') as string;
    const discussionNode = q ? highlight(discussionTitle, q) : discussionTitle;
    const controls = discussion ? DiscussionControls.controls(discussion, this).toArray() : [];

    return (
      <article key={post.id()} className="AvocadoSearch-postCard">
        <div className="AvocadoSearch-postHead">
          <div className="AvocadoSearch-postAvatar">{user && <Avatar user={user} />}</div>
          <div className="AvocadoSearch-postMeta">
            <a
              href={userHref}
              className="AvocadoSearch-postAuthor"
              onclick={(e: Event) => {
                e.stopPropagation();
                navigate(e as MouseEvent, userHref);
              }}
            >
              {displayName(user)}
            </a>
            {timeLabel && <span className="AvocadoSearch-postTime">{timeLabel}</span>}
          </div>
        </div>

        {discussion && (
          <a href={href} className="AvocadoSearch-postDiscussion" onclick={(e: Event) => navigate(e as MouseEvent, href)}>
            <i className="far fa-comments" aria-hidden="true" />
            {discussionNode}
          </a>
        )}

        {excerptNode && <p className="AvocadoSearch-postExcerpt">{excerptNode}</p>}

        <div className="AvocadoSearch-postFooter">
          {controls.length > 0 && (
            <Dropdown
              className="AvocadoHome-threadControls AvocadoSearch-postControls"
              icon="fas fa-ellipsis-v"
              buttonClassName="Button Button--icon Button--flat AvocadoHome-threadControls-toggle"
              accessibleToggleLabel={app.translator.trans('core.forum.discussion_controls.toggle_dropdown_accessible_label') as string}
            >
              {controls}
            </Dropdown>
          )}
          <a href={href} className="AvocadoSearch-postViewBtn" onclick={(e: Event) => navigate(e as MouseEvent, href)}>
            {trans('ramon-avocado.forum.home.view_post', 'View post')}
            <i className="fas fa-arrow-right" aria-hidden="true" />
          </a>
        </div>
      </article>
    );
  }
}
