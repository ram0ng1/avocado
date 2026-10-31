import DiscussionListState from 'flarum/forum/states/DiscussionListState';
import type Discussion from 'flarum/common/models/Discussion';
import type { DiscussionListParams } from 'flarum/forum/states/DiscussionListState';
import type { PaginatedListRequestParams } from 'flarum/common/states/PaginatedListState';
import { apiInclude } from '../utils';

// Sem firstPost/lastPost: o ThreadCard lê resumo, curtidas e a última resposta
// de atributos da discussão, e incluir os posts custava o render do s9e de dois
// posts inteiros por card.
const FEED_INCLUDE = (): string => apiInclude('user', 'lastPostedUser', 'tags');

/**
 * `DiscussionListState` com o que os feeds em tempo real do tema precisam:
 * discussões que chegaram pelo WebSocket esperando o banner (`pendingDiscs`),
 * ids destacados como novos (`newDiscIds`), likes do próprio usuário para calar
 * o eco do realtime (`selfActionIds`), likes remotos (`updatedLikeIds`) e falhas
 * de refetch que o banner ainda conta (`wsFetchFailures`).
 */
export default class DiscussionFeedState<P extends DiscussionListParams = DiscussionListParams> extends DiscussionListState<P> {
  pendingDiscs = new Map<string, Discussion>();
  newDiscIds = new Set<string>();
  selfActionIds = new Set<string>();
  updatedLikeIds = new Set<string>();
  wsFetchFailures = 0;

  /** Garante as relações que o ThreadCard exige, seja qual for o feed. */
  requestParams(): PaginatedListRequestParams {
    const params = super.requestParams();
    return { ...params, include: FEED_INCLUDE() };
  }

  /**
   * Discussões de todas as páginas carregadas, fixadas no topo. A view itera isto,
   * não `getPages()`.
   */
  flatItems(): Discussion[] {
    const flat: Discussion[] = [];
    this.getPages().forEach((page) => {
      const items = Array.isArray(page.items) ? page.items : (page.items as any).data || [];
      items.forEach((d: any) => d && flat.push(d));
    });
    flat.sort((a: any, b: any) => (b.isSticky?.() ? 1 : 0) - (a.isSticky?.() ? 1 : 0));
    return flat;
  }

  /**
   * Passa as chegadas pendentes para o feed: cada uma entra no topo por
   * `addDiscussion` (que deduplica) e fica marcada como nova por ~4s.
   */
  flushPending(): void {
    const pending = Array.from(this.pendingDiscs.values());
    this.pendingDiscs.clear();
    this.wsFetchFailures = 0;

    pending.forEach((disc: any) => {
      const id = String(disc.id?.() || '');
      this.addDiscussion(disc);
      this.newDiscIds.add(id);
    });

    m.redraw();
    setTimeout(() => {
      this.newDiscIds.clear();
      m.redraw();
    }, 4000);
  }

  /** Número mostrado no banner do WS. */
  pendingCount(): number {
    return this.pendingDiscs.size + this.wsFetchFailures;
  }

  isEmptyResult(): boolean {
    return !this.isInitialLoading() && !this.hasItems();
  }
}
