import DiscussionListState from 'flarum/forum/states/DiscussionListState';
import type Discussion from 'flarum/common/models/Discussion';
import type { DiscussionListParams } from 'flarum/forum/states/DiscussionListState';
import type { PaginatedListRequestParams } from 'flarum/common/states/PaginatedListState';

const FEED_INCLUDE = ['user', 'firstPost', 'lastPostedUser', 'lastPost', 'tags'];

/**
 * `DiscussionFeedState` is `DiscussionListState` with the extras Avocado's
 * realtime feeds need:
 *
 *  - `pendingDiscs`     — discussions that arrived over the WebSocket and are
 *                         waiting for the user to flush them via the banner.
 *  - `newDiscIds`       — IDs that should briefly highlight as "new" after a flush.
 *  - `selfActionIds`    — IDs whose like the current user just toggled, used to
 *                         silence the realtime self-echo animation.
 *  - `updatedLikeIds`   — IDs that should pop briefly after a remote like.
 *  - `wsFetchFailures`  — counter that the banner falls back to when a refetch
 *                         failed but we still want to indicate "something happened".
 *
 * Replaces the manual `discussions[] / loading / hasMore / offset / sort`
 * fields previously duplicated in AllDiscussionsPage and TagPage.
 */
export default class DiscussionFeedState<P extends DiscussionListParams = DiscussionListParams> extends DiscussionListState<P> {
  pendingDiscs = new Map<string, Discussion>();
  newDiscIds = new Set<string>();
  selfActionIds = new Set<string>();
  updatedLikeIds = new Set<string>();
  wsFetchFailures = 0;

  /**
   * Override request params to ensure ThreadCard's required relationships are
   * always included regardless of which feed instantiates this state.
   */
  requestParams(): PaginatedListRequestParams {
    const params = super.requestParams();
    return { ...params, include: FEED_INCLUDE };
  }

  /**
   * Flat array of discussions across all loaded pages, sticky-sorted to the top.
   * The view should iterate this rather than `getPages()` directly.
   */
  flatItems(): Discussion[] {
    const flat: Discussion[] = [];
    this.getPages().forEach((page) => {
      const items = Array.isArray(page.items) ? page.items : (page.items as any).data || [];
      items.forEach((d: any) => d && flat.push(d));
    });
    flat.sort((a: any, b: any) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
    return flat;
  }

  /**
   * Flush all pending realtime arrivals into the live feed: each is added to
   * the top via `addDiscussion` (which dedups), then marked as "newly arrived"
   * for ~4s so the card can render a highlight.
   */
  flushPending(): void {
    const pending = Array.from(this.pendingDiscs.values());
    this.pendingDiscs.clear();
    this.wsFetchFailures = 0;

    pending.forEach((disc: any) => {
      const id = String(disc.id?.() || '');
      this.addDiscussion(disc);
      this.newDiscIds.add(id);
    });

    m.redraw();
    setTimeout(() => {
      this.newDiscIds.clear();
      m.redraw();
    }, 4000);
  }

  /** Total number to display in the WS update banner. */
  pendingCount(): number {
    return this.pendingDiscs.size + this.wsFetchFailures;
  }

  /** True when the feed is empty after the initial fetch finished. */
  isEmptyResult(): boolean {
    return !this.isInitialLoading() && !this.hasItems();
  }
}
