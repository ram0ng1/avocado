import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';

import { trans, truncate } from '../utils';

/**
 * Renders the `avocadoBookmarkReminder` alert. The subject is the saved
 * discussion (visibility-gated relation); the actor's note is rehydrated from
 * the discussion attributes when available — never from notification data.
 */
export default class BookmarkReminderNotification extends Notification {
  icon() {
    return 'fas fa-bookmark';
  }

  href() {
    const discussion = (this.attrs as any).notification.subject();
    return discussion ? app.route.discussion(discussion) : '#';
  }

  content() {
    return trans('ramon-avocado.forum.notifications.bookmark_reminder_text', 'Reminder about your saved discussion');
  }

  excerpt() {
    const discussion = (this.attrs as any).notification.subject();
    const note = discussion?.attribute?.('bookmarkNote');
    return note ? truncate(String(note), 160) : null;
  }
}
