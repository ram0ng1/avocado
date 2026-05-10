import app from 'flarum/forum/app';
import { bindRealtime, pushPayloadDiscussion } from '../realtime';

const INCLUDE = 'user,firstPost,lastPostedUser,lastPost,tags';

export interface DiscussionFeedHandlers {
  /** Returns true when the broadcast should affect the calling feed. */
  filter?: (discussion: any) => boolean;
  /** Set tracking like-actions the user originated, to skip self-echo animations. */
  selfActionIds?: Set<string>;
  /** Map of liked-discussion IDs that should pop briefly after a remote like. */
  updatedLikeIds?: Set<string>;
  /** Map of pending realtime discussions waiting for the user to flush them. */
  pendingDiscs?: Map<string, any>;
  /** Currently rendered list — used to detect "is this an existing item?". */
  currentItems?: () => any[];
  /** Increment when a fetch fails; the WS banner falls back to a generic count. */
  onFetchFailure?: () => void;
  /** Called after store hydration to allow the consumer to reorder/re-render. */
  onHydrated?: (discussion: any, originalEvent: 'post' | 'like' | 'pin' | 'remove') => void;
}

/**
 * Bind the canonical Avocado realtime handlers (post/like/pin/remove) for a
 * discussion-list feed. Each handler:
 *
 *  1. Resolves the broadcast payload into a Discussion model via the store.
 *  2. Optionally drops events that don't apply to this feed (`filter`).
 *  3. Refetches with full includes so cards have user/firstPost/tags ready.
 *  4. Updates the supplied tracking sets and triggers the consumer hook.
 *
 * Returns the unbind function from `bindRealtime` — call it from `onremove`.
 */
export function bindDiscussionFeedRealtime(handlers: DiscussionFeedHandlers): () => void {
  const {
    filter = () => true,
    selfActionIds,
    updatedLikeIds,
    pendingDiscs,
    currentItems = () => [],
    onFetchFailure,
    onHydrated,
  } = handlers;

  const refetch = (id: string | number) =>
    app.store.find('discussions', String(id), { include: INCLUDE });

  return bindRealtime({
    onPost: (data) => {
      const disc = pushPayloadDiscussion(data);
      const id = disc?.id?.();
      if (!id || !filter(disc)) return;

      refetch(id)
        .then((d: any) => {
          if (!d) return;
          if (pendingDiscs) {
            const exists = currentItems().some((x) => String(x.id?.() || '') === String(id));
            if (!exists) pendingDiscs.set(String(id), d);
          }
          onHydrated?.(d, 'post');
          m.redraw();
        })
        .catch(() => {
          onFetchFailure?.();
          m.redraw();
        });
    },

    onLike: (data) => {
      const disc = pushPayloadDiscussion(data);
      const id = disc?.id?.();
      if (!id || !filter(disc)) return;

      const sid = String(id);
      const isSelf = !!selfActionIds?.has(sid);
      if (isSelf) selfActionIds!.delete(sid);

      refetch(id)
        .then((d: any) => {
          if (!isSelf && updatedLikeIds) {
            updatedLikeIds.add(sid);
            setTimeout(() => {
              updatedLikeIds.delete(sid);
              m.redraw();
            }, 500);
          }
          onHydrated?.(d, 'like');
          m.redraw();
        })
        .catch(() => {});
    },

    onPinned: (data) => {
      const disc = pushPayloadDiscussion(data);
      const id = disc?.id?.();
      if (!id || !filter(disc)) return;

      refetch(id)
        .then((d: any) => {
          onHydrated?.(d, 'pin');
          m.redraw();
        })
        .catch(() => {});
    },

    onPostRemoved: (data) => {
      const disc = pushPayloadDiscussion(data);
      const id = disc?.id?.();
      if (!id || !filter(disc)) return;

      // Only refetch if this discussion is currently rendered or pending —
      // avoids wasted requests when a moderator hides a post elsewhere.
      const isVisible =
        currentItems().some((x) => String(x.id?.() || '') === String(id)) ||
        !!pendingDiscs?.has(String(id));
      if (!isVisible) return;

      refetch(id)
        .then((d: any) => {
          onHydrated?.(d, 'remove');
          m.redraw();
        })
        .catch(() => {});
    },
  });
}
