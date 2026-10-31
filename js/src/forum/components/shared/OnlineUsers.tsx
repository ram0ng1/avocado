import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import { displayName, navigate, safeRoute, userSlug } from '../../utils';

export interface IOnlineUsersAttrs extends ComponentAttrs {
  className?: string;
  /** Máximo de avatares antes de virar contagem. */
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
 * Payload que o Content\InjectOnlineUsers põe no <head> como
 * `window.__avocadoOnlineUsers`: fonte única, para não varrer a tabela de
 * usuários duas vezes por página. Vazio com o recurso desligado.
 */
function getOnlineUsers(): any[] {
  const list = (window as any).__avocadoOnlineUsers;
  return Array.isArray(list) ? list : [];
}

export default class OnlineUsers<CustomAttrs extends IOnlineUsersAttrs = IOnlineUsersAttrs> extends Component<CustomAttrs> {
  view() {
    if (!app.forum?.attribute('avocadoShowOnlineUsers')) return null;

    const users = getOnlineUsers();
    if (!users.length) return null;

    const maxShown = this.attrs.maxShown ?? 6;
    const total = users.length;
    const shown = users.slice(0, maxShown);
    // O backend pode mandar models do Flarum ou objetos simples `{ id, username, … }`.
    const isPlain = shown[0] && typeof shown[0].username === 'string';

    const wrapperClass = ['AvocadoHome-onlineAvatars', this.attrs.className].filter(Boolean).join(' ');

    return (
      <div className={wrapperClass}>
        <div className="AvocadoHome-onlineAvatars-row">{shown.map((user: any, i: number) => this.renderAvatar(user, i, isPlain))}</div>
        {app.forum?.attribute('avocadoShowOnlineCount') !== false && (
          <span className="AvocadoHome-onlineAvatars-count">
            {total} {app.translator.trans('ramon-avocado.forum.online_users.online')}
          </span>
        )}
      </div>
    );
  }

  private renderAvatar(user: any, index: number, isPlain: boolean) {
    const key = isPlain ? user.id : user.id?.();
    const userModel = isPlain ? (key ? app.store.getById('users', String(key)) : null) : user;
    // `slug` vem do slug driver configurado (Content\InjectOnlineUsers); o
    // username só é fallback para um payload antigo ainda no cache de 30s.
    const slug = userSlug(userModel) || (isPlain ? user.slug || user.username : '');
    const name = userModel?.displayName?.() || userModel?.username?.() || (isPlain ? user.displayName || user.username : displayName(user));
    const avatarUrl = userModel?.avatarUrl?.() || (isPlain ? user.avatarUrl || null : null);
    const profileHref = safeRoute('user', { username: slug });
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
