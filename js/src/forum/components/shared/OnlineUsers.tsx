import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import { displayName, navigate, safeRoute } from '../../utils';

export interface IOnlineUsersAttrs extends ComponentAttrs {
  /** Optional className appended to the outer wrapper. */
  className?: string;
  /** Maximum number of avatars to render before collapsing to a count. */
  maxShown?: number;
}

const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg,#ffd166,#f28482)',
  'linear-gradient(135deg,#89cff0,#6b7fc4)',
  'linear-gradient(135deg,#9eea6c,#337d63)',
  'linear-gradient(135deg,#f0b213,#e84393)',
  'linear-gradient(135deg,#c5ccff,#b5e3ff)',
  'linear-gradient(135deg,#ffb5a7,#fcd5ce)',
];

/**
 * Reads the online-user payload injected by the backend.
 *
 * The PHP side may push to `window.__avocadoOnlineUsers` (a plain JSON list)
 * or expose it via `app.forum.attribute('avocadoOnlineUsers')`. Both shapes
 * are supported. Returns an empty array when the feature is unavailable.
 */
function getOnlineUsers(): any[] {
  const win = window as any;
  if (Array.isArray(win.__avocadoOnlineUsers)) return win.__avocadoOnlineUsers;
  const injected = app.forum?.attribute('avocadoOnlineUsers');
  return Array.isArray(injected) ? injected : [];
}

/**
 * OnlineUsers — compact avatar row for currently-online members.
 *
 * Renders nothing when:
 *  - the `avocadoShowOnlineUsers` setting is off, or
 *  - the backend has not exposed an online-users list.
 *
 * Used by HomePage and AllDiscussionsPage. Both pages used to inline this
 * markup with subtly different render logic — kept in sync here.
 */
export default class OnlineUsers<CustomAttrs extends IOnlineUsersAttrs = IOnlineUsersAttrs> extends Component<CustomAttrs> {
  view() {
    if (!app.forum?.attribute('avocadoShowOnlineUsers')) return null;

    const users = getOnlineUsers();
    if (!users.length) return null;

    const maxShown = this.attrs.maxShown ?? 6;
    const total = users.length;
    const shown = users.slice(0, maxShown);
    // Backend may emit either Flarum models or plain `{ id, username, ... }` objects.
    const isPlain = shown[0] && typeof shown[0].username === 'string';

    const wrapperClass = ['AvocadoHome-onlineAvatars', this.attrs.className].filter(Boolean).join(' ');

    return (
      <div className={wrapperClass}>
        <div className="AvocadoHome-onlineAvatars-row">
          {shown.map((user: any, i: number) => this.renderAvatar(user, i, isPlain))}
        </div>
        {app.forum?.attribute('avocadoShowOnlineCount') !== false && (
          <span className="AvocadoHome-onlineAvatars-count">{total} online</span>
        )}
      </div>
    );
  }

  private renderAvatar(user: any, index: number, isPlain: boolean) {
    const key = isPlain ? user.id : user.id?.();
    const userModel = isPlain ? (key ? app.store.getById('users', String(key)) : null) : user;
    const username = userModel?.username?.() || (isPlain ? user.username : '');
    const name =
      userModel?.displayName?.() ||
      userModel?.username?.() ||
      (isPlain ? user.displayName || user.username : displayName(user));
    const avatarUrl = userModel?.avatarUrl?.() || (isPlain ? user.avatarUrl || null : null);
    const profileHref = safeRoute('user', { username });
    const fallbackBg = FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length];

    return (
      <a
        key={key}
        className="AvocadoHome-onlineAvatars-item"
        href={profileHref}
        onclick={(e: Event) => {
          e.stopPropagation();
          navigate(e, profileHref);
        }}
        title={name}
        style={avatarUrl ? {} : { background: fallbackBg }}
      >
        {avatarUrl && <img src={avatarUrl} alt={name} className="Avatar" width="28" height="28" decoding="async" />}
      </a>
    );
  }
}
