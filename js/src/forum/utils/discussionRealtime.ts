import app from 'flarum/forum/app';
import { bindRealtime, pushPayloadDiscussion } from '../realtime';
import { apiInclude } from '../utils';

// O firstPost fica: se o post já estiver no store (curtido daqui, visto na
// discussão), é ele que o card lê para as curtidas, e o refetch o mantém em dia.
// A última resposta vem em `avocadoLastPostExcerpt`, então o lastPost sai.
const INCLUDE = (): string => apiInclude('user', 'firstPost', 'lastPostedUser', 'tags');

export interface DiscussionFeedHandlers {
  /** True quando o evento afeta este feed. */
  filter?: (discussion: any) => boolean;
  /** Likes que o próprio usuário fez, para pular a animação do eco. */
  selfActionIds?: Set<string>;
  /** Discussões com like remoto recente, que pulsam por um instante. */
  updatedLikeIds?: Set<string>;
  /** Discussões do realtime esperando o usuário trazê-las pelo banner. */
  pendingDiscs?: Map<string, any>;
  /** Lista desenhada agora, para saber se o item já existe. */
  currentItems?: () => any[];
  /** Conta fetches que falharam; o banner cai num número genérico. */
  onFetchFailure?: () => void;
  /** Chamado depois de hidratar o store, para o consumidor reordenar/redesenhar. */
  onHydrated?: (discussion: any, originalEvent: 'post' | 'like' | 'pin' | 'remove') => void;
}

/**
 * Liga os handlers de realtime (post/like/pin/remove) de um feed de discussões:
 * cada um resolve o payload no store, descarta o que não vale para o feed
 * (`filter`), refaz o fetch com as relações dos cards e atualiza os sets.
 * Devolve o unbind do `bindRealtime`, para chamar no `onremove`.
 */
export function bindDiscussionFeedRealtime(handlers: DiscussionFeedHandlers): () => void {
  const { filter = () => true, selfActionIds, updatedLikeIds, pendingDiscs, currentItems = () => [], onFetchFailure, onHydrated } = handlers;

  const refetch = (id: string | number) => app.store.find('discussions', String(id), { include: INCLUDE() });

  return bindRealtime({
    onPost: (data) => {
      const disc = pushPayloadDiscussion(data);
      const id = disc?.id?.();
      if (!id || !filter(disc)) return;

      refetch(id)
        .then((d: any) => {
          if (!d) return;
          if (pendingDiscs) {
            const exists = currentItems().some((x) => String(x.id?.() || '') === String(id));
            if (!exists) pendingDiscs.set(String(id), d);
          }
          onHydrated?.(d, 'post');
          m.redraw();
        })
        .catch(() => {
          onFetchFailure?.();
          m.redraw();
        });
    },

    onLike: (data) => {
      const disc = pushPayloadDiscussion(data);
      const id = disc?.id?.();
      if (!id || !filter(disc)) return;

      const sid = String(id);
      const isSelf = !!selfActionIds?.has(sid);
      if (isSelf) selfActionIds!.delete(sid);

      refetch(id)
        .then((d: any) => {
          if (!isSelf && updatedLikeIds) {
            updatedLikeIds.add(sid);
            setTimeout(() => {
              updatedLikeIds.delete(sid);
              m.redraw();
            }, 500);
          }
          onHydrated?.(d, 'like');
          m.redraw();
        })
        .catch(() => {});
    },

    onPinned: (data) => {
      const disc = pushPayloadDiscussion(data);
      const id = disc?.id?.();
      if (!id || !filter(disc)) return;

      refetch(id)
        .then((d: any) => {
          onHydrated?.(d, 'pin');
          m.redraw();
        })
        .catch(() => {});
    },

    onPostRemoved: (data) => {
      const disc = pushPayloadDiscussion(data);
      const id = disc?.id?.();
      if (!id || !filter(disc)) return;

      // Só refaz o fetch se a discussão está desenhada ou pendente: evita requests à
      // toa quando um moderador oculta um post em outro lugar.
      const isVisible = currentItems().some((x) => String(x.id?.() || '') === String(id)) || !!pendingDiscs?.has(String(id));
      if (!isVisible) return;

      refetch(id)
        .then((d: any) => {
          onHydrated?.(d, 'remove');
          m.redraw();
        })
        .catch(() => {});
    },
  });
}
