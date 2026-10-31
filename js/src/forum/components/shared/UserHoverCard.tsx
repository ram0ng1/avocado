import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import listItems from 'flarum/common/helpers/listItems';

import { trans, truncate, displayName, userRoute, navigate, formatTimeLabel, formatDate, coverPosition } from '../../utils';
import CakedayBadge from './CakedayBadge';
import trustedHtml from '../../../common/trustedHtml';

/** Conta numérica do atributo, ou null quando ausente (renderiza "–"). */
function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && !isNaN(value) ? value : null;
}

const OPEN_DELAY = 350;
const CLOSE_DELAY = 150;
const CARD_WIDTH = 330;
const CARD_EST_HEIGHT = 330;
/** O mais perto da borda que a seta chega: o raio do canto do card + meia seta. */
const ARROW_INSET = 26;
/** Num gatilho largo (o nome) a seta mira o começo dele, não o meio. */
const ARROW_REACH = 28;

/**
 * Estado do card no nível do módulo, desenhado num portal próprio no <body> via
 * m.render. O PostStream recria instâncias mantendo o mesmo nó DOM e os handlers
 * antigos continuam ligados: com o estado na instância, o open rodaria numa
 * instância descartada. Fora do vdom, qualquer instância aciona o mesmo singleton.
 */
let portal: HTMLElement | null = null;
let currentUser: any = null;
let triggerEl: HTMLElement | null = null;
let cardEl: HTMLElement | null = null;
let openTimer: number | null = null;
let closeTimer: number | null = null;
let pendingUser: any = null;
let pendingEl: HTMLElement | null = null;
let pos = { top: 0, left: 0, above: false, arrow: ARROW_INSET };

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
    arrow: 0,
  };
  pos.top = pos.above ? rect.top : rect.bottom;
  // A seta aponta para o gatilho (avatar ou nome), mesmo quando o card foi
  // empurrado para caber na tela — só não entra na curva do canto.
  const target = rect.left + Math.min(rect.width / 2, ARROW_REACH);
  pos.arrow = Math.max(ARROW_INSET, Math.min(target - pos.left, CARD_WIDTH - ARROW_INSET));

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
  // O fof/user-bio renderiza a bio no servidor (s9e) em `bioHtml`; sem isso o
  // BBCode/markdown apareceria cru. `bio` em texto puro é o fallback.
  const bioHtml = user.bioHtml?.() as string | undefined;
  const bio = (user.bio?.() || user.attribute?.('bio') || '') as string;
  const joined = user.joinTime?.();
  const lastSeen = user.lastSeenAt?.();
  const online = !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  const discussions = countOrNull(user.attribute?.('discussionCount'));
  const posts = countOrNull(user.attribute?.('commentCount'));
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
  const verified = VerifiedBadge && user.attribute?.('isVerified') ? m(VerifiedBadge as any, { user, className: 'AvocadoUserCard-verified' }) : null;

  const goProfile = (e: Event) => {
    closeCard();
    navigate(e as MouseEvent, profileHref);
  };

  return (
    <div
      className={`AvocadoUserCard-wrap${pos.above ? ' AvocadoUserCard-wrap--above' : ''}`}
      style={{ top: `${pos.top}px`, left: `${pos.left}px`, '--avocado-usercard-arrow': `${Math.round(pos.arrow)}px` }}
    >
      <div
        className="AvocadoUserCard"
        oncreate={(v: any) => (cardEl = v.dom as HTMLElement)}
        onmouseenter={() => cancelClose()}
        onmouseleave={() => scheduleClose()}
      >
        <div className="AvocadoUserCard-banner" style={cover ? { backgroundImage: `url(${cover})`, backgroundPosition: coverPosition(user) } : {}} />

        <div className="AvocadoUserCard-body">
          <div className="AvocadoUserCard-head">
            <a
              className={`AvocadoUserCard-avatarLink${online ? ' AvocadoUserCard-avatarLink--online' : ''}`}
              href={profileHref}
              aria-label={displayName(user) as string}
              onclick={goProfile}
            >
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
                {/* Online é indicado pelo anel verde no avatar (uniforme com post/perfil);
                    na meta só mostramos "visto há X" quando offline. */}
                {!online && lastSeen && (
                  <span className="AvocadoUserCard-presence">
                    {trans('ramon-avocado.forum.user_card.last_seen', 'Seen {time}', { time: formatTimeLabel(lastSeen) })}
                  </span>
                )}
              </span>
            </div>
          </div>

          {bioHtml ? (
            <div className="AvocadoUserCard-bio AvocadoUserCard-bio--html">{trustedHtml(bioHtml)}</div>
          ) : bio ? (
            <p className="AvocadoUserCard-bio">{truncate(bio, 180)}</p>
          ) : null}

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
                <strong>{formatDate(new Date(joined), { month: 'short', year: 'numeric' })}</strong>
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

  // O MessageComposer não vem pelo registry: o asyncModuleImport resolve para o
  // ComposerBody abstrato e o compositor quebra no render. Reaproveita a ação
  // "Enviar mensagem" que o flarum/messages registra em UserControls, que usa o
  // import interno do próprio bundle dele.
  try {
    const UserControls = (flarum as any).reg?.get?.('core', 'forum/utils/UserControls');
    const items = UserControls?.userControls?.(user);
    const onclick = items?.get?.('sendMessage')?.attrs?.onclick;

    // Ausente quando flarum/messages não está instalado ou o usuário não pode
    // receber mensagens — nesses casos o botão do card simplesmente não aparece.
    if (typeof onclick === 'function') {
      onclick(new MouseEvent('click'));
    }
  } catch (e) {
    console.warn('[avocado] não foi possível abrir o compositor de mensagens', e);
  }
}

/**
 * Handlers de hover para acoplar o card a um elemento que já existe, sem
 * wrapper: ex. o <h3 className="PostUser-name">, que precisa continuar filho
 * direto de .PostUser para o CSS e para extensões que o acham por vnode.
 * Devolve {} com o card desativado, e o Object.assign vira no-op.
 */
export function hoverCardAttrs(user: any): Record<string, any> {
  if (!user || !userCardEnabled()) return {};

  const open = (e: MouseEvent) => {
    (e as any).redraw = false;
    scheduleOpen(user, e.currentTarget as HTMLElement | null);
  };

  return {
    onmouseenter: open,
    onmousemove: open,
    onmouseleave: (e: MouseEvent) => {
      (e as any).redraw = false;
      scheduleClose();
    },
  };
}

export interface UserHoverCardAttrs {
  user: any;
  [key: string]: any;
}

/**
 * Gatilho do card, em volta de qualquer avatar/nome:
 *
 *   <UserHoverCard user={user}><Avatar user={user} /></UserHoverCard>
 *
 * O estado fica no singleton acima; o mousemove rearma a abertura para
 * sobreviver à recriação do PostStream. Só hover: no toque o tap abre o perfil.
 */
export default class UserHoverCard extends Component<UserHoverCardAttrs> {
  view(vnode: any) {
    const user = this.attrs.user;
    if (!user || !userCardEnabled()) return vnode.children;

    return (
      <span className="AvocadoUserCard-trigger" {...hoverCardAttrs(user)}>
        {vnode.children}
      </span>
    );
  }
}
