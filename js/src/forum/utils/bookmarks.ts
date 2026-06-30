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

export function isBookmarked(discussion: any): boolean {
  return !!discussion?.attribute?.('bookmarked');
}

function apiUrl(): string {
  return ((app.forum.attribute<string>('apiUrl') as string) || '/api').replace(/\/+$/, '');
}

function setBookmarked(discussion: any, value: boolean): void {
  discussion.pushData({ attributes: { bookmarked: value } });
}

export function toggleBookmark(discussion: any): void {
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
      app.alerts.show(
        { type: 'error' },
        trans('ramon-avocado.forum.bookmarks.toggle_error', 'Could not update your saved list. Please try again.')
      );
      m.redraw();
    });
}
