import app from 'flarum/forum/app';

import { realtimeAvailable } from '../realtime';

/**
 * Presence ("quem está lendo agora") por discussão, via presence channels do
 * flarum/realtime. O client Pusher do realtime autentica no endpoint DELE, cujo
 * AuthController não aceita presence channels com id — então mantemos uma
 * segunda conexão apontando para o nosso /avocado/presence/auth (com header
 * CSRF; a rota não é isenta). A classe Pusher vem do próprio app.websocket
 * (construtor), sem adicionar pusher-js ao bundle do tema.
 */

export interface PresenceMember {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

export interface PresenceState {
  /** Membros visíveis (exclui quem desativou discloseOnline). */
  members: PresenceMember[];
  count: number;
}

let client: any = null;

export function presenceEnabled(): boolean {
  return !!app.forum?.attribute?.('avocadoPresenceEnabled') && realtimeAvailable() && !!app.session?.user;
}

function presenceClient(): any {
  if (!presenceEnabled()) return null;

  const base = (app as any).websocket;
  if (!base || client) return client;

  try {
    const PusherCtor = base.constructor;
    const secure = !!app.forum.attribute('websocket.secure');
    client = new PusherCtor(app.forum.attribute('websocket.key'), {
      channelAuthorization: {
        endpoint: `${app.forum.attribute('apiUrl')}/avocado/presence/auth`,
        transport: 'ajax',
        headers: { 'X-CSRF-Token': app.session.csrfToken },
      },
      wsHost: app.forum.attribute('websocket.host'),
      wsPort: app.forum.attribute('websocket.port'),
      wssPort: app.forum.attribute('websocket.port'),
      enabledTransports: ['wss', 'ws'],
      forceTLS: secure,
    });
  } catch {
    client = null;
  }

  return client;
}

function readMembers(channel: any): PresenceState {
  const members: PresenceMember[] = [];

  try {
    channel.members?.each?.((member: any) => {
      const info = member?.info || {};
      if (info.hidden) return;
      members.push({
        id: String(member.id),
        displayName: (info.displayName || info.username || '?') as string,
        username: (info.username || '') as string,
        avatarUrl: (info.avatarUrl || null) as string | null,
      });
    });
  } catch {
    /* canal em teardown */
  }

  return { members, count: members.length };
}

/**
 * Entra no presence channel da discussão e chama onChange a cada mudança de
 * membros. Devolve a função de saída (safe para onremove mesmo sem conexão).
 */
export function joinDiscussionPresence(discussionId: string, onChange: (state: PresenceState) => void): () => void {
  const pusher = presenceClient();
  if (!pusher || !discussionId) return () => {};

  const name = `presence-avocado-discussion=${discussionId}`;
  const channel = pusher.subscribe(name);
  const update = () => onChange(readMembers(channel));

  channel.bind('pusher:subscription_succeeded', update);
  channel.bind('pusher:member_added', update);
  channel.bind('pusher:member_removed', update);

  return () => {
    try {
      channel.unbind('pusher:subscription_succeeded', update);
      channel.unbind('pusher:member_added', update);
      channel.unbind('pusher:member_removed', update);
      pusher.unsubscribe(name);
    } catch {
      /* já desconectado */
    }
  };
}
