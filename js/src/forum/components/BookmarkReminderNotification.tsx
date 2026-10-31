import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';

import { trans, truncate } from '../utils';
import { bookmarkNote } from '../utils/bookmarks';

/**
 * Alerta `avocadoBookmarkReminder`. A nota vem dos atributos da discussão
 * (relação com checagem de visibilidade), nunca dos dados da notificação.
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
    const note = discussion ? bookmarkNote(discussion) : '';
    return note ? truncate(note, 160) : null;
  }
}
