import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';

import {
  trans,
  navigate,
  displayName,
  safeRoute,
  renderThreadSkeleton,
  renderLoadMore,
  renderEmpty,
} from '../utils';
import { toggleDiscussionLike } from '../utils/likes';
import { DISCUSSION_LIST_SORT } from '../utils/sortOptions';
import { bindDiscussionFeedRealtime } from '../utils/discussionRealtime';

import DiscussionFeedState from '../states/DiscussionFeedState';

import ThreadCard from './shared/ThreadCard';
import SortDropdown from './shared/SortDropdown';
import WsUpdateBanner from './shared/WsUpdateBanner';
import OnlineUsers from './shared/OnlineUsers';
import InlineComposer from './shared/InlineComposer';

/**
 * AllDiscussionsPage — `/discussions` route.
 *
 * Pagination, realtime queue, sort and self-echo tracking all live in
 * `feedState` (a `DiscussionFeedState`). This page only orchestrates the UI:
 * inline composer, online-users header, WS banner, ThreadCard list.
 */
export default class AllDiscussionsPage extends Page {
  private feedState!: DiscussionFeedState;
  private likingIds = new Set<string>();
  private unbindRealtime: (() => void) | null = null;
  private composerOpen = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--index';

    const sort = m.route.param('sort') || 'latest';
    this.feedState = new DiscussionFeedState({ sort });
    this.feedState.refresh();
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);

    this.unbindRealtime = bindDiscussionFeedRealtime({
      selfActionIds: this.feedState.selfActionIds,
      updatedLikeIds: this.feedState.updatedLikeIds,
      pendingDiscs: this.feedState.pendingDiscs,
      currentItems: () => this.feedState.flatItems(),
      onFetchFailure: () => this.feedState.wsFetchFailures++,
      // No special action on pin/unpin — `flatItems()` re-sorts on every read.
    });
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    this.unbindRealtime?.();
    this.unbindRealtime = null;
  }

  // ── Composer ────────────────────────────────────────────────────────────────

  private openComposer() {
    if (!app.session.user) {
      app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));
      return;
    }
    this.composerOpen = true;
    m.redraw();
  }

  private closeComposer() {
    this.composerOpen = false;
    m.redraw();
  }

  private onDiscussionSubmitted(discussion: any) {
    if (discussion?.id?.()) {
      m.route.set(app.route('discussion', { id: discussion.id(), slug: discussion.slug?.() || discussion.id() }));
    }
  }

  // ── View ────────────────────────────────────────────────────────────────────

  view() {
    const user = app.session.user;
    const homeHref = safeRoute('index');
    const discussions = this.feedState.flatItems();
    const isLoadingNext = this.feedState.isLoadingNext();
    const isInitialLoading = this.feedState.isInitialLoading();
    const currentSort = (this.feedState.getParams() as any).sort || 'latest';

    return (
      <div className="AvocadoDiscussions">
        <div className="AvocadoNav-helper"><IndexSidebar /></div>

        <div className="AvocadoDiscussions-header">
          <h1 className="AvocadoDiscussions-title">
            {trans('ramon-avocado.forum.discussions.title', 'All discussions')}
          </h1>
          <div className="AvocadoDiscussions-controls">
            <SortDropdown
              options={DISCUSSION_LIST_SORT}
              currentKey={currentSort}
              onChange={(key: string) => this.feedState.refreshParams({ sort: key } as any, 1)}
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

        <div className="AvocadoDiscussions-onlineBlock">
          <OnlineUsers />
        </div>

        {user && !this.composerOpen && this.renderComposerTrigger(user)}
        {this.composerOpen && (
          <InlineComposer
            user={user}
            onClose={() => this.closeComposer()}
            onSubmitted={(disc: any) => this.onDiscussionSubmitted(disc)}
          />
        )}

        <WsUpdateBanner
          pendingCount={this.feedState.pendingCount()}
          onFlush={() => this.feedState.flushPending()}
        />

        <div className="AvocadoHome-threadStack">
          {discussions.length === 0 && isInitialLoading
            ? renderThreadSkeleton(5)
            : discussions.length === 0
              ? renderEmpty(trans('ramon-avocado.forum.discussions.empty', 'No discussions found.'))
              : discussions.map((d: any) => (
                  <ThreadCard
                    key={d.id?.()}
                    discussion={d}
                    context={this}
                    likingIds={this.likingIds}
                    updatedLikeIds={this.feedState.updatedLikeIds}
                    newDiscIds={this.feedState.newDiscIds}
                    onToggleLike={(disc: any) => toggleDiscussionLike(disc, this.likingIds, this.feedState.selfActionIds)}
                  />
                ))}
          {discussions.length > 0 && isLoadingNext && renderThreadSkeleton(3)}
        </div>

        {this.feedState.hasNext() && !isLoadingNext &&
          renderLoadMore(trans('ramon-avocado.forum.discussions.load_more', 'Load more'), () => this.feedState.loadNext())}
      </div>
    );
  }

  private renderComposerTrigger(user: any) {
    return (
      <div className="AvocadoHome-postInput" onclick={() => this.openComposer()}>
        <div className="AvocadoHome-postInput-inner">
          {user && <Avatar user={user} className="AvocadoHome-postInput-avatar" title={displayName(user)} />}
          <span className="AvocadoHome-postInput-placeholder">
            {trans('ramon-avocado.forum.home.start_discussion', 'Tell everyone what are you working on...')}
          </span>
          <button
            className="AvocadoHome-postInput-newBtn"
            type="button"
            onclick={(e: Event) => {
              e.stopPropagation();
              this.openComposer();
            }}
          >
            <i className="fas fa-plus" aria-hidden="true" />
            {trans('ramon-avocado.forum.home.new_discussion', 'New discussion')}
          </button>
        </div>
      </div>
    );
  }
}
