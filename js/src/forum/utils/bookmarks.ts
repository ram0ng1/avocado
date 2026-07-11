import app from 'flarum/forum/app';
import { trans } from '../utils';

/**
 * Bookmark (saved discussion) toggle with optimistic UI.
 *
 * The server state lives in `avocado_bookmarks`; the discussion model carries a
 * read-only `bookmarked` attribute (serialized per-actor). We flip that
 * attribute locally for an instant response, then POST/DELETE the dedicated
 * endpoint. On failure we revert the flip and surface an alert (CLAUDE.md §40.2),
 * never swallowing the error silently.
 *
 * `pending` dedups concurrent clicks per discussion id. It holds only in-flight
 * request ids (transient, not actor data), so the module-level set is safe.
 */
const pending = new Set<string>();

/** Admin master switch for the whole bookmark system (avocado.bookmarks_enabled). */
export function bookmarksEnabled(): boolean {
  return !!app.forum?.attribute?.('avocadoBookmarksEnabled');
}

export function isBookmarked(discussion: any): boolean {
  return !!discussion?.attribute?.('bookmarked');
}

export function bookmarkNote(discussion: any): string {
  return (discussion?.attribute?.('bookmarkNote') || '') as string;
}

export function bookmarkRemindAt(discussion: any): Date | null {
  const raw = discussion?.attribute?.('bookmarkRemindAt');
  if (!raw) return null;
  const date = new Date(raw as string);
  return isNaN(date.getTime()) ? null : date;
}

function apiUrl(): string {
  return ((app.forum.attribute<string>('apiUrl') as string) || '/api').replace(/\/+$/, '');
}

function setBookmarked(discussion: any, value: boolean): void {
  const attributes: Record<string, unknown> = { bookmarked: value };
  if (!value) {
    attributes.bookmarkNote = null;
    attributes.bookmarkRemindAt = null;
  }
  discussion.pushData({ attributes });
}

/**
 * Persists note/reminder for the actor's bookmark (upsert — saves the
 * discussion when it wasn't saved yet). Mirrors the server response back into
 * the discussion model so cards/modals re-render with authoritative values.
 * Errors are re-thrown so the calling UI (modal) can keep its own state.
 */
export function updateBookmark(discussion: any, payload: { note?: string | null; remindAt?: string | null }): Promise<void> {
  const id = String(discussion?.id?.() || '');
  if (!id) return Promise.reject(new Error('missing discussion id'));

  return app
    .request({
      method: 'PATCH',
      url: `${apiUrl()}/avocado/bookmark`,
      body: { discussionId: Number(id), ...payload },
    })
    .then((response: any) => {
      discussion.pushData({
        attributes: {
          bookmarked: true,
          bookmarkNote: response?.note ?? null,
          bookmarkRemindAt: response?.remindAt ?? null,
        },
      });
      m.redraw();
    });
}

export function toggleBookmark(discussion: any): void {
  if (!bookmarksEnabled()) return;
  if (!app.session.user) {
    app.modal.show(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/LogInModal'));
    return;
  }

  const id = String(discussion?.id?.() || '');
  if (!id || pending.has(id)) return;

  const current = isBookmarked(discussion);
  const next = !current;

  pending.add(id);
  setBookmarked(discussion, next);
  m.redraw();

  app
    .request({
      method: next ? 'POST' : 'DELETE',
      url: `${apiUrl()}/avocado/bookmark`,
      body: { discussionId: Number(id) },
    })
    .then(() => {
      pending.delete(id);
      m.redraw();
    })
    .catch(() => {
      setBookmarked(discussion, current);
      pending.delete(id);
      app.alerts.show({ type: 'error' }, trans('ramon-avocado.forum.bookmarks.toggle_error', 'Could not update your saved list. Please try again.'));
      m.redraw();
    });
}
