import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import listItems from 'flarum/common/helpers/listItems';

import { trans, truncate, displayName, userRoute, navigate, numberOr, formatTimeLabel } from '../../utils';
import CakedayBadge from './CakedayBadge';

const OPEN_DELAY = 350;
const CLOSE_DELAY = 150;
const CARD_WIDTH = 330;
const CARD_EST_HEIGHT = 330;

/**
 * Estado do card em nível de MÓDULO, renderizado num portal próprio no <body>
 * via m.render — nunca dentro da árvore do componente trigger. Motivo: o
 * PostStream recria instâncias do componente mantendo o mesmo nó DOM, e os
 * event handlers antigos ("zumbis") continuam ligados ao elemento; se o estado
 * morasse na instância, o open rodava numa instância descartada cujo view
 * nunca mais renderiza. Com o estado e o render fora do vdom, qualquer
 * instância (viva ou zumbi) dispara o mesmo singleton e o card sempre monta.
 */
let portal: HTMLElement | null = null;
let currentUser: any = null;
let triggerEl: HTMLElement | null = null;
let cardEl: HTMLElement | null = null;
let openTimer: number | null = null;
let closeTimer: number | null = null;
let pendingUser: any = null;
let pendingEl: HTMLElement | null = null;
let pos = { top: 0, left: 0, above: false };

/** Perfis já hidratados nesta sessão (dedup do fetch; libera no erro p/ retry). */
const hydratedIds = new Set<string>();

export function userCardEnabled(): boolean {
  return !!app.forum?.attribute?.('avocadoUserCardEnabled');
}

function ensurePortal(): HTMLElement {
  if (!portal || !document.body.contains(portal)) {
    portal = document.createElement('div');
    portal.className = 'AvocadoUserCard-portalRoot';
    document.body.appendChild(portal);
  }
  return portal;
}

function renderPortal(): void {
  m.render(ensurePortal(), currentUser ? cardVnode(currentUser) : null);
}

const onMouseMove = (e: MouseEvent) => {
  if (!currentUser) return;
  const target = e.target as Node | null;
  if (target && (cardEl?.contains(target) || triggerEl?.contains(target))) {
    cancelClose();
    return;
  }
  if (!closeTimer) scheduleClose();
};

const onDocDown = (e: MouseEvent) => {
  const target = e.target as Node | null;
  if (target && (cardEl?.contains(target) || triggerEl?.contains(target))) return;
  closeCard();
};

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeCard();
};

const onDismiss = () => closeCard();

function watch(): void {
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKeyDown);
  document.documentElement.addEventListener('mouseleave', onDismiss);
  window.addEventListener('scroll', onDismiss, { passive: true });
  window.addEventListener('blur', onDismiss);
}

function unwatch(): void {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mousedown', onDocDown, true);
  document.removeEventListener('keydown', onKeyDown);
  document.documentElement.removeEventListener('mouseleave', onDismiss);
  window.removeEventListener('scroll', onDismiss);
  window.removeEventListener('blur', onDismiss);
}

function clearTimers(): void {
  if (openTimer) window.clearTimeout(openTimer);
  if (closeTimer) window.clearTimeout(closeTimer);
  openTimer = closeTimer = null;
}

export function scheduleOpen(user: any, el: HTMLElement | null): void {
  if (!user || !el || !userCardEnabled()) return;
  cancelClose();

  if (currentUser && triggerEl === el) return;

  pendingUser = user;
  pendingEl = el;
  if (openTimer) return;

  openTimer = window.setTimeout(() => {
    openTimer = null;
    openCard(pendingUser, pendingEl);
  }, OPEN_DELAY);
}

export function scheduleClose(): void {
  if (openTimer) {
    window.clearTimeout(openTimer);
    openTimer = null;
  }
  if (!currentUser || closeTimer) return;

  closeTimer = window.setTimeout(() => {
    closeTimer = null;
    closeCard();
  }, CLOSE_DELAY);
}

function cancelClose(): void {
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function openCard(user: any, el: HTMLElement | null): void {
  if (!user || !el || !el.isConnected) return;

  const rect = el.getBoundingClientRect();
  const pad = 8;
  pos = {
    left: Math.max(pad, Math.min(rect.left, window.innerWidth - CARD_WIDTH - pad)),
    above: rect.bottom + CARD_EST_HEIGHT > window.innerHeight && rect.top > CARD_EST_HEIGHT,
    top: 0,
  };
  pos.top = pos.above ? rect.top : rect.bottom;

  currentUser = user;
  triggerEl = el;
  watch();
  hydrate(user);
  renderPortal();
}

export function closeCard(): void {
  clearTimers();
  unwatch();
  if (!currentUser) return;
  currentUser = null;
  triggerEl = null;
  cardEl = null;
  renderPortal();
}

function hydrate(user: any): void {
  const id = String(user?.id?.() || '');
  if (!id || hydratedIds.has(id)) return;
  hydratedIds.add(id);

  app.store
    .find('users', id)
    .then(() => renderPortal())
    .catch(() => {
      hydratedIds.delete(id);
    });
}

function cardVnode(user: any) {
  const profileHref = userRoute(user);
  const cover = (user.attribute?.('cover_thumbnail') || user.attribute?.('cover')) as string | null;
  const bio = (user.attribute?.('bio') || '') as string;
  const joined = user.joinTime?.();
  const lastSeen = user.lastSeenAt?.();
  const online = !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  const discussions = numberOr(user.attribute?.('discussionCount'), null);
  const posts = numberOr(user.attribute?.('commentCount'), null);
  const badges = (user.badges?.()?.toArray?.() || []) as any[];
  const self = app.session.user;
  const canMessage =
    !!self &&
    String(self.id?.()) !== String(user.id?.()) &&
    typeof (self as any).canSendAnyMessage === 'function' &&
    (self as any).canSendAnyMessage();

  // Selo da ext ramon-verified, quando instalada — mesmo componente das outras
  // superfícies, resolvido pelo registry (ausente = null).
  const VerifiedBadge = (flarum as any).reg?.get?.('ramon-verified', 'common/components/VerifiedBadge');
  const verified =
    VerifiedBadge && user.attribute?.('isVerified') ? m(VerifiedBadge as any, { user, className: 'AvocadoUserCard-verified' }) : null;

  const goProfile = (e: Event) => {
    closeCard();
    navigate(e as MouseEvent, profileHref);
  };

  return (
    <div
      className={`AvocadoUserCard-wrap${pos.above ? ' AvocadoUserCard-wrap--above' : ''}`}
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
    >
      <div
        className="AvocadoUserCard"
        oncreate={(v: any) => (cardEl = v.dom as HTMLElement)}
        onmouseenter={() => cancelClose()}
        onmouseleave={() => scheduleClose()}
      >
        <div className="AvocadoUserCard-banner" style={cover ? { backgroundImage: `url(${cover})` } : {}} />

        <div className="AvocadoUserCard-body">
          <div className="AvocadoUserCard-head">
            <a className="AvocadoUserCard-avatarLink" href={profileHref} aria-label={displayName(user) as string} onclick={goProfile}>
              <Avatar user={user} className="AvocadoUserCard-avatar" />
            </a>

            <div className="AvocadoUserCard-names">
              <span className="AvocadoUserCard-nameRow">
                <a className="AvocadoUserCard-displayName" href={profileHref} onclick={goProfile}>
                  {displayName(user)}
                </a>
                {verified}
                <CakedayBadge user={user} />
                {badges.length > 0 && <ul className="badges AvocadoUserCard-badges">{listItems(badges.slice(0, 3))}</ul>}
              </span>
              <span className="AvocadoUserCard-username">
                @{user.username?.()}
                {online ? (
                  <span className="AvocadoUserCard-presence AvocadoUserCard-presence--online">
                    {trans('ramon-avocado.forum.user_card.online', 'Online')}
                  </span>
                ) : lastSeen ? (
                  <span className="AvocadoUserCard-presence">
                    {trans('ramon-avocado.forum.user_card.last_seen', 'Seen {time}', { time: formatTimeLabel(lastSeen) })}
                  </span>
                ) : null}
              </span>
            </div>
          </div>

          {bio && <p className="AvocadoUserCard-bio">{truncate(bio, 180)}</p>}

          <div className="AvocadoUserCard-stats">
            <span className="AvocadoUserCard-stat">
              <strong>{discussions !== null ? discussions : '–'}</strong>
              {trans('ramon-avocado.forum.user_card.discussions', 'discussions')}
            </span>
            <span className="AvocadoUserCard-stat">
              <strong>{posts !== null ? posts : '–'}</strong>
              {trans('ramon-avocado.forum.user_card.posts', 'posts')}
            </span>
            {joined && (
              <span className="AvocadoUserCard-stat">
                <strong>{new Date(joined).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</strong>
                {trans('ramon-avocado.forum.user_card.joined_label', 'joined')}
              </span>
            )}
          </div>

          <div className="AvocadoUserCard-actions">
            <a className="Button Button--primary AvocadoUserCard-profileBtn" href={profileHref} onclick={goProfile}>
              <i className="fas fa-user" aria-hidden="true" />
              {trans('ramon-avocado.forum.user_card.view_profile', 'View profile')}
            </a>
            {canMessage && (
              <button className="Button AvocadoUserCard-messageBtn" type="button" onclick={() => openMessageComposer(user)}>
                <i className="fas fa-envelope" aria-hidden="true" />
                {trans('ramon-avocado.forum.user_card.message', 'Message')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function openMessageComposer(user: any): void {
  closeCard();

  (flarum as any).reg.asyncModuleImport('flarum/forum/components/ComposerBody').then(() => {
    app.composer
      .load(() => (flarum as any).reg.asyncModuleImport('ext:flarum/messages/forum/components/MessageComposer'), {
        user: app.session.user,
        recipients: [user],
      })
      .then(() => app.composer.show());
  });
}

export interface UserHoverCardAttrs {
  /** The user model (from a discussion/post relation or the store). */
  user: any;
  [key: string]: any;
}

/**
 * Trigger do card Discourse-style. Envolva qualquer avatar/nome:
 *
 *   <UserHoverCard user={user}><Avatar user={user} /></UserHoverCard>
 *
 * O componente é só o gatilho — todo estado/render do card vive no singleton
 * acima. O mousemove rearma a abertura para sobreviver à recriação de
 * instância do PostStream. Hover-only por design: no touch o elemento
 * embrulhado mantém o tap normal (navegar ao perfil).
 */
export default class UserHoverCard extends Component<UserHoverCardAttrs> {
  view(vnode: any) {
    const user = this.attrs.user;
    if (!user || !userCardEnabled()) return vnode.children;

    return (
      <span
        className="AvocadoUserCard-trigger"
        onmouseenter={(e: MouseEvent) => {
          (e as any).redraw = false;
          scheduleOpen(user, e.currentTarget as HTMLElement | null);
        }}
        onmousemove={(e: MouseEvent) => {
          (e as any).redraw = false;
          scheduleOpen(user, e.currentTarget as HTMLElement | null);
        }}
        onmouseleave={(e: MouseEvent) => {
          (e as any).redraw = false;
          scheduleClose();
        }}
      >
        {vnode.children}
      </span>
    );
  }
}
