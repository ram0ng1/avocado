import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';

import { trans } from '../utils';
import { toggleBookmark, updateBookmark, bookmarkNote, bookmarkRemindAt } from '../utils/bookmarks';

type ReminderChoice = 'none' | 'later' | 'tomorrow' | 'week' | 'custom';

/**
 * Discourse-style bookmark editor: a note plus an optional reminder. Presets
 * are computed client-side into an ISO instant; "custom" exposes a native
 * datetime-local input. Saving is an upsert (PATCH /avocado/bookmark), so the
 * modal also works as "save with note" for a not-yet-saved discussion.
 */
export default class BookmarkModal extends Modal<any> {
  private note = '';
  private choice: ReminderChoice = 'none';
  private customValue = '';

  oninit(vnode: any) {
    super.oninit(vnode);

    const discussion = this.attrs.discussion;
    this.note = bookmarkNote(discussion);

    const existing = bookmarkRemindAt(discussion);
    if (existing && existing.getTime() > Date.now()) {
      this.choice = 'custom';
      this.customValue = toLocalInputValue(existing);
    }
  }

  className() {
    return 'AvocadoBookmarkModal Modal--small';
  }

  title() {
    return trans('ramon-avocado.forum.bookmarks.modal_title', 'Bookmark');
  }

  content() {
    const choices: { key: ReminderChoice; label: string }[] = [
      { key: 'none', label: trans('ramon-avocado.forum.bookmarks.reminder_none', 'No reminder') as string },
      { key: 'later', label: trans('ramon-avocado.forum.bookmarks.reminder_later', 'Later today (in 4 hours)') as string },
      { key: 'tomorrow', label: trans('ramon-avocado.forum.bookmarks.reminder_tomorrow', 'Tomorrow morning') as string },
      { key: 'week', label: trans('ramon-avocado.forum.bookmarks.reminder_week', 'Next week') as string },
      { key: 'custom', label: trans('ramon-avocado.forum.bookmarks.reminder_custom', 'Pick date & time') as string },
    ];

    return (
      <div className="Modal-body">
        <form onsubmit={(e: Event) => this.onsubmit(e)}>
          <div className="Form-group">
            <label className="AvocadoBookmarkModal-label" for="avocado-bookmark-note">
              {trans('ramon-avocado.forum.bookmarks.note_label', 'Note')}
            </label>
            <textarea
              id="avocado-bookmark-note"
              className="FormControl AvocadoBookmarkModal-note"
              rows="3"
              maxlength="1000"
              placeholder={trans('ramon-avocado.forum.bookmarks.note_placeholder', 'Why are you saving this? (optional)') as string}
              value={this.note}
              oninput={(e: InputEvent) => (this.note = (e.target as HTMLTextAreaElement).value)}
            />
          </div>

          <div className="Form-group">
            <label className="AvocadoBookmarkModal-label" for="avocado-bookmark-reminder">
              {trans('ramon-avocado.forum.bookmarks.reminder_label', 'Remind me')}
            </label>
            <select
              id="avocado-bookmark-reminder"
              className="FormControl"
              value={this.choice}
              onchange={(e: Event) => (this.choice = (e.target as HTMLSelectElement).value as ReminderChoice)}
            >
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {this.choice === 'custom' && (
            <div className="Form-group">
              <input
                type="datetime-local"
                className="FormControl"
                aria-label={trans('ramon-avocado.forum.bookmarks.reminder_custom', 'Pick date & time') as string}
                min={toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                value={this.customValue}
                oninput={(e: InputEvent) => (this.customValue = (e.target as HTMLInputElement).value)}
              />
            </div>
          )}

          <div className="Form-group AvocadoBookmarkModal-actions">
            <Button className="Button Button--primary" type="submit" loading={this.loading}>
              {trans('ramon-avocado.forum.bookmarks.modal_save', 'Save')}
            </Button>
            <Button
              className="Button AvocadoBookmarkModal-remove"
              type="button"
              icon="far fa-trash-alt"
              disabled={this.loading}
              onclick={() => {
                toggleBookmark(this.attrs.discussion);
                this.hide();
              }}
            >
              {trans('ramon-avocado.forum.bookmarks.unsave', 'Remove from saved')}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  onsubmit(e: Event) {
    e.preventDefault();

    let remindAt: string | null = null;
    if (this.choice === 'later') {
      remindAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    } else if (this.choice === 'tomorrow') {
      remindAt = atNineAm(1).toISOString();
    } else if (this.choice === 'week') {
      remindAt = atNineAm(7).toISOString();
    } else if (this.choice === 'custom') {
      const parsed = this.customValue ? new Date(this.customValue) : null;
      if (!parsed || isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        app.alerts.show({ type: 'error' }, trans('ramon-avocado.forum.bookmarks.reminder_invalid', 'Pick a date in the future.'));
        return;
      }
      remindAt = parsed.toISOString();
    }

    this.loading = true;

    updateBookmark(this.attrs.discussion, { note: this.note.trim() || null, remindAt })
      .then(() => this.hide())
      .catch(() => {
        this.loaded();
        app.alerts.show({ type: 'error' }, trans('ramon-avocado.forum.bookmarks.update_error', 'Could not update your bookmark. Please try again.'));
      });
  }
}

/** Formats a Date into the local `YYYY-MM-DDTHH:mm` shape datetime-local expects. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local 09:00, `days` days from today. */
function atNineAm(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}
