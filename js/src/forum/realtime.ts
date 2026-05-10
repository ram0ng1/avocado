// Avocado realtime adapter for flarum/realtime.
//
// Wraps app.websocket_channels.{public,user} so theme components can subscribe
// to broadcasts without caring whether the extension is installed/enabled.
// When flarum/realtime is missing, every helper is a no-op — the theme keeps
// working with no console warnings.
//
// Event-name reference (must match what the PHP side broadcasts):
//   Flarum\Discussion\Event\Started → first post of a new discussion
//   Flarum\Post\Event\Posted        → replies (post.number > 1)
//   likesMutation                   → likes/unlikes (configured in extend.php)
//   discussionPinned                → sticky/unsticky (configured in extend.php)
//   postRemoved                     → post deleted/hidden/restored (configured in extend.php)

import app from 'flarum/forum/app';

export const POSTED_EVENT  = 'Flarum\\Post\\Event\\Posted';
export const STARTED_EVENT = 'Flarum\\Discussion\\Event\\Started';
export const LIKES_EVENT   = 'likesMutation';
export const PINNED_EVENT  = 'discussionPinned';
export const REMOVED_EVENT = 'postRemoved';

export type RealtimeHandler = (data: any) => void;

export interface RealtimeBindings {
  /** Fired when a new post or new discussion is broadcast. */
  onPost?: RealtimeHandler;
  /** Fired when a like is added or removed. */
  onLike?: RealtimeHandler;
  /** Fired when a discussion is pinned or unpinned. */
  onPinned?: RealtimeHandler;
  /** Fired when a post is deleted, hidden or restored (covers all visibility flips). */
  onPostRemoved?: RealtimeHandler;
  /** Bind any other event name on both channels. */
  custom?: Record<string, RealtimeHandler>;
}

/** True only when flarum/realtime is enabled and its websocket is reachable. */
export function realtimeAvailable(): boolean {
  // `flarum.extensions` lists every enabled extension by id. Cheaper than
  // probing app.websocket and avoids touching uninitialised properties.
  return 'flarum-realtime' in (flarum as any).extensions;
}

/**
 * Push a JSON:API payload through the store and return the resulting model.
 * Use inside handlers to extract the discussion that an event refers to.
 *
 * The realtime payload for Started/Posted/likesMutation/discussionPinned is a
 * Discussion document (PostResource resolves to its parent discussion in
 * Generator::__invoke()). Returns null on malformed data.
 */
export function pushPayloadDiscussion(data: any): any {
  try {
    const model = data ? (app.store as any).pushPayload(data) : null;
    return model && typeof model.id === 'function' ? model : null;
  } catch {
    return null;
  }
}

/**
 * Bind handlers to the realtime channels. Returns an unbind function that is
 * safe to call from onremove regardless of whether subscription succeeded.
 *
 * Every event is bound on both the public and the user channel because
 * SendTriggerJob dispatches twice — once globally (public) and once per
 * connected logged-in user (private-user=…). Binding both ensures the handler
 * fires exactly once for guests and once for logged-in users.
 */
export function bindRealtime(bindings: RealtimeBindings): () => void {
  if (!realtimeAvailable()) return () => {};

  const channels = (app as any).websocket_channels as
    | { public?: any; user?: any }
    | undefined;

  if (!channels) return () => {};

  const entries: Array<[string, RealtimeHandler]> = [];
  if (bindings.onPost) {
    entries.push([POSTED_EVENT,  bindings.onPost]);
    entries.push([STARTED_EVENT, bindings.onPost]);
  }
  if (bindings.onLike)        entries.push([LIKES_EVENT,   bindings.onLike]);
  if (bindings.onPinned)      entries.push([PINNED_EVENT,  bindings.onPinned]);
  if (bindings.onPostRemoved) entries.push([REMOVED_EVENT, bindings.onPostRemoved]);
  if (bindings.custom) {
    for (const [name, handler] of Object.entries(bindings.custom)) {
      entries.push([name, handler]);
    }
  }

  const targets = [channels.public, channels.user].filter(Boolean);
  for (const ch of targets) {
    for (const [name, handler] of entries) {
      try { ch.bind(name, handler); } catch { /* channel torn down — ignore */ }
    }
  }

  return () => {
    for (const ch of targets) {
      for (const [name, handler] of entries) {
        try { ch.unbind(name, handler); } catch { /* ignore */ }
      }
    }
  };
}
