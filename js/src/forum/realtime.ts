// Adaptador do flarum/realtime: embrulha app.websocket_channels.{public,user}
// para os componentes assinarem eventos sem saber se a extensão existe. Sem ela
// todo helper é no-op.
//
// Nomes dos eventos (precisam bater com o que o PHP transmite):
//   Flarum\Discussion\Event\Started → primeiro post de uma discussão nova
//   Flarum\Post\Event\Posted        → respostas (post.number > 1)
//   likesMutation                   → like/unlike (extend.php)
//   discussionPinned                → fixar/desafixar (extend.php)
//   postRemoved                     → post apagado/oculto/restaurado (extend.php)

import app from 'flarum/forum/app';

export const POSTED_EVENT = 'Flarum\\Post\\Event\\Posted';
export const STARTED_EVENT = 'Flarum\\Discussion\\Event\\Started';
export const LIKES_EVENT = 'likesMutation';
export const PINNED_EVENT = 'discussionPinned';
export const REMOVED_EVENT = 'postRemoved';

export type RealtimeHandler = (data: any) => void;

export interface RealtimeBindings {
  /** Novo post ou nova discussão. */
  onPost?: RealtimeHandler;
  /** Like adicionado ou removido. */
  onLike?: RealtimeHandler;
  /** Discussão fixada ou desafixada. */
  onPinned?: RealtimeHandler;
  /** Post apagado, oculto ou restaurado. */
  onPostRemoved?: RealtimeHandler;
  /** Qualquer outro evento, nos dois canais. */
  custom?: Record<string, RealtimeHandler>;
}

/** Só true com o flarum/realtime ativo e o websocket acessível. */
export function realtimeAvailable(): boolean {
  // `flarum.extensions` lista as extensões ativas: mais barato que sondar
  // app.websocket, e não toca propriedades ainda não inicializadas.
  return 'flarum-realtime' in (flarum as any).extensions;
}

/**
 * Passa um payload JSON:API pelo store e devolve o model. O payload de
 * Started/Posted/likesMutation/discussionPinned é um documento de Discussion (o
 * PostResource resolve para a discussão no Generator::__invoke()). Null com dado
 * malformado.
 */
export function pushPayloadDiscussion(data: any): any {
  try {
    const model = data ? (app.store as any).pushPayload(data) : null;
    return model && typeof model.id === 'function' ? model : null;
  } catch {
    return null;
  }
}

/**
 * Liga os handlers nos canais e devolve um unbind seguro no onremove, mesmo se a
 * assinatura falhou. Todo evento vai nos dois canais porque o SendTriggerJob
 * dispara duas vezes (público e private-user): o handler roda uma vez para guests
 * e uma vez para quem está logado.
 */
export function bindRealtime(bindings: RealtimeBindings): () => void {
  if (!realtimeAvailable()) return () => {};

  const channels = (app as any).websocket_channels as { public?: any; user?: any } | undefined;

  if (!channels) return () => {};

  const entries: Array<[string, RealtimeHandler]> = [];
  if (bindings.onPost) {
    entries.push([POSTED_EVENT, bindings.onPost]);
    entries.push([STARTED_EVENT, bindings.onPost]);
  }
  if (bindings.onLike) entries.push([LIKES_EVENT, bindings.onLike]);
  if (bindings.onPinned) entries.push([PINNED_EVENT, bindings.onPinned]);
  if (bindings.onPostRemoved) entries.push([REMOVED_EVENT, bindings.onPostRemoved]);
  if (bindings.custom) {
    for (const [name, handler] of Object.entries(bindings.custom)) {
      entries.push([name, handler]);
    }
  }

  const targets = [channels.public, channels.user].filter(Boolean);
  for (const ch of targets) {
    for (const [name, handler] of entries) {
      try {
        ch.bind(name, handler);
      } catch {
        /* canal já desfeito */
      }
    }
  }

  return () => {
    for (const ch of targets) {
      for (const [name, handler] of entries) {
        try {
          ch.unbind(name, handler);
        } catch {
          /* ignore */
        }
      }
    }
  };
}
