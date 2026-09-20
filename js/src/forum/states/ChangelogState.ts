import app from 'flarum/forum/app';

/** Espelha PAGE_LIMIT do Content\PreloadChangelog. */
export const CHANGELOG_PAGE_LIMIT = 12;

const INCLUDE = ['user', 'firstPost', 'tags'];

export interface ChangelogFilter {
  /** Slugs dos produtos — mais de um vira OR num único request. */
  productSlugs: string[];
  /** Slug da sub-tag de tipo; combina em AND com o produto. */
  typeSlug: string | null;
}

/**
 * As versões do changelog: paginação por offset sobre `GET /discussions`
 * filtrado por tag, do mais novo para o mais antigo.
 *
 * Não usa o DiscussionFeedState: aquele é um feed de tempo real com fila de
 * chegadas por websocket, e uma lista de lançamentos não tem nada disso — só
 * precisa de "a primeira página, mais uma página, e refazer ao trocar o filtro".
 */
export default class ChangelogState {
  entries: any[] = [];
  loading = true;
  loadingMore = false;
  failed = false;
  hasMore = false;

  private nextOffset = 0;
  /** Descarta a resposta de um request que o usuário já deixou para trás. */
  private generation = 0;

  /**
   * Primeira página vinda do payload do boot (Content\PreloadChangelog).
   *
   * Roda no oninit, antes do 1º view(): pushPayload insere os models no store
   * de forma síncrona, então a página pinta direto com os cards. O payload vale
   * para uma rota só (`product`) e é consumido uma vez — voltar à página depois
   * de navegar busca dados frescos em vez de reexibir os do boot.
   */
  hydrateFromBoot(product: string | null): boolean {
    const boot = (app as any).data?.avocadoChangelog;

    if (!boot || (boot.product ?? null) !== product) return false;

    delete (app as any).data.avocadoChangelog;

    try {
      app.store.pushPayload(boot.tags);
      const pushed = app.store.pushPayload(boot.discussions) as any;
      const items = (Array.isArray(pushed) ? pushed : [pushed]).filter(Boolean);

      if (!items.length) return false;

      this.entries = items;
      this.nextOffset = items.length;
      this.hasMore = !!boot.discussions?.links?.next;
      this.loading = false;
      return true;
    } catch {
      // Payload malformado nunca derruba a página — cai no caminho async.
      return false;
    }
  }

  async load(filter: ChangelogFilter): Promise<void> {
    const generation = ++this.generation;

    this.entries = [];
    this.nextOffset = 0;
    this.hasMore = false;
    this.failed = false;
    this.loading = true;
    m.redraw();

    try {
      const results = await this.fetch(filter, 0);
      if (generation !== this.generation) return;
      this.entries = [...results].filter(Boolean);
      this.advance(results);
    } catch {
      if (generation !== this.generation) return;
      this.failed = true;
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        m.redraw();
      }
    }
  }

  async loadMore(filter: ChangelogFilter): Promise<void> {
    if (this.loadingMore || !this.hasMore) return;

    const generation = this.generation;

    this.loadingMore = true;
    m.redraw();

    try {
      const results = await this.fetch(filter, this.nextOffset);
      if (generation !== this.generation) return;
      const seen = new Set(this.entries.map((entry) => entry.id()));
      this.entries = [...this.entries, ...[...results].filter((entry: any) => entry && !seen.has(entry.id()))];
      this.advance(results);
    } catch {
      if (generation !== this.generation) return;
      this.failed = true;
    } finally {
      if (generation === this.generation) {
        this.loadingMore = false;
        m.redraw();
      }
    }
  }

  /** Nada a listar (sem produtos configurados ou produto desconhecido). */
  settleEmpty(): void {
    this.generation++;
    this.entries = [];
    this.hasMore = false;
    this.failed = false;
    this.loading = false;
    this.loadingMore = false;
  }

  private advance(results: any): void {
    this.nextOffset += results.length;
    this.hasMore = !!results.payload?.links?.next;
  }

  private fetch(filter: ChangelogFilter, offset: number): Promise<any> {
    const products = filter.productSlugs.join(',');

    return app.store.find('discussions', {
      // Um filtro por request: produto(s) em OR; com tipo, dois grupos, que o
      // TagFilter do flarum/tags combina em AND.
      filter: { tag: filter.typeSlug ? [products, filter.typeSlug] : products },
      sort: '-createdAt',
      include: INCLUDE,
      page: { limit: CHANGELOG_PAGE_LIMIT, offset },
    } as any);
  }
}
