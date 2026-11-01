import app from 'flarum/forum/app';
import { numberOr, apiInclude } from '../utils';
import { firstPostLikes } from '../utils/likes';

/**
 * Sem firstPost/lastPost: resumo, capa, curtidas e a última resposta do card vêm
 * em atributos da discussão (Api\DiscussionFields / DiscussionLikeFields).
 * Incluir os posts fazia o servidor renderizar dois posts inteiros por card.
 */
const SHOWCASE_INCLUDE = (): string => apiInclude('user', 'lastPostedUser', 'tags');

/** Teto do request de complemento da lista (ver `fillFeed`). */
const FILL_LIMIT = 50;

/** Espelham o default e o teto de `avocado.home_feed_count` (extend.php / admin). */
const DEFAULT_FEED_COUNT = 5;
const MAX_FEED_COUNT = 20;

/** Tamanho da página que a index entrega no boot (padrão do Flarum). */
const INDEX_PAGE_SIZE = 20;

export type HomeFeedSort = 'popular' | 'latest';

/**
 * Estado da home: o feed (populares ou recentes, conforme o admin), as
 * categorias e a vitrine, com cache. A página só lê os getters, nunca o
 * `app.store`.
 */
export default class HomeState {
  homeLoading = true;
  showcaseLoading = false;

  private showcaseItems: any[] = [];
  private showcaseFetched = false;
  private showcaseCache: Record<string, any[]> = {};

  /** Complemento da lista quando a página do boot não cobre a contagem (ver `fillFeed`). */
  private feedExtra: any[] = [];
  private feedFill: Promise<void> | null = null;

  /** Preload da lista de tags em voo (dedup entre a home e o showcase). */
  private tagListLoad: Promise<any> | null = null;

  // Memo, invalidado quando muda o número de discussões no store.
  private cachedFeed: any[] | null = null;
  private cachedStoreSize = -1;

  /** Todas as discussões no store, aceitando o formato paginado ou plano. */
  allDiscussions(): any[] {
    try {
      const pages = (app as any).discussions?.getPages?.();
      if (Array.isArray(pages) && pages.length > 0) {
        const out: any[] = [];
        if (typeof pages[0] === 'object' && pages[0] !== null && 'items' in pages[0]) {
          pages.forEach((p: any) => p?.items && out.push(...p.items));
        } else {
          out.push(...pages);
        }
        const filtered = out.filter(Boolean);
        if (filtered.length > 0) return filtered;
      }
      return app.store.all('discussions').filter(Boolean);
    } catch {
      return app.store.all('discussions').filter(Boolean);
    }
  }

  /**
   * Pontuação: soma ponderada de respostas, likes e visualizações, com bônus de
   * recência que decai linearmente em uma semana.
   */
  discussionScore(d: any): number {
    const replyCount = numberOr(d.replyCount?.(), 0);
    const likeCount = firstPostLikes(d).count;
    const views = numberOr(d.attribute?.('viewCount'), 0);
    const lastPostedAt = d.lastPostedAt?.();
    const ageMs = lastPostedAt ? Date.now() - new Date(lastPostedAt).getTime() : Infinity;
    const recency = Math.max(0, 1 - ageMs / (7 * 24 * 3600 * 1000));
    return replyCount * 2 + likeCount * 3 + views * 0.1 + recency * 20;
  }

  /** Ids das tags da vitrine. */
  showcaseTagIds(): Set<string> {
    if (!app.forum?.attribute('avocadoShowcaseEnabled')) return new Set();
    const raw = app.forum?.attribute('avocadoShowcaseTag') || '';
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw as string);
      if (Array.isArray(parsed)) return new Set(parsed.map(String).filter(Boolean));
    } catch {
      /* fallthrough */
    }
    const s = String(raw).trim();
    return s ? new Set([s]) : new Set();
  }

  isShowcaseDiscussion(d: any): boolean {
    const ids = this.showcaseTagIds();
    if (!ids.size) return false;
    return (d.tags?.() || []).some((t: any) => ids.has(String(t?.id?.())));
  }

  /** Ordem da lista da home (admin): `popular` (pontuação) ou `latest` (última atividade). */
  feedSort(): HomeFeedSort {
    return app.forum?.attribute('avocadoHomeFeedSort') === 'latest' ? 'latest' : 'popular';
  }

  /** Quantas discussões a lista da home mostra (admin: 5 a 20). */
  feedCount(): number {
    const n = Math.round(numberOr(Number(app.forum?.attribute('avocadoHomeFeedCount')), DEFAULT_FEED_COUNT));
    return Math.min(MAX_FEED_COUNT, Math.max(1, n));
  }

  /** Discussões da home, na ordem e na quantidade do admin. */
  feedDiscussions(): any[] {
    this.invalidateIfStoreChanged();
    if (this.cachedFeed?.length) return this.cachedFeed;

    const sort = this.feedSort();
    const lastPosted = (d: any): number => {
      const at = d.lastPostedAt?.();
      return at ? new Date(at).getTime() : 0;
    };

    const result = this.feedCandidates()
      .sort((a, b) => {
        const aSticky = a.isSticky?.() ? 1 : 0;
        const bSticky = b.isSticky?.() ? 1 : 0;
        if (bSticky !== aSticky) return bSticky - aSticky;
        return sort === 'latest' ? lastPosted(b) - lastPosted(a) : this.discussionScore(b) - this.discussionScore(a);
      })
      .slice(0, this.feedCount());

    if (result.length > 0) this.cachedFeed = result;
    return result;
  }

  /**
   * O que pode entrar na lista: a página da index + o complemento de `fillFeed`,
   * sem as discussões que já estão nos cards da vitrine. Só essas saem (no
   * máximo `showcaseCount`), não toda discussão com tag da vitrine: com todas
   * as categorias na vitrine a lista ficava vazia. É também o que o
   * PreloadHomeFeed conta no servidor.
   */
  private feedCandidates(): any[] {
    const inShowcase = new Set((this.showcaseItems.length ? this.showcaseItems : this.showcaseFromStore()).map((d) => String(d?.id?.() ?? '')));
    const seen = new Set<string>();
    return [...this.allDiscussions(), ...this.feedExtra].filter((d) => {
      const id = String(d?.id?.() ?? '');
      if (!id || seen.has(id) || inShowcase.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  /** Tags de primeiro nível, na ordem do admin. */
  topCategories(limit = 7): any[] {
    try {
      const tags = (app.store.all('tags') as any[]).filter((t) => t && !t.parent?.());
      return tags.sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999)).slice(0, limit);
    } catch {
      return [];
    }
  }

  /** Discussões da vitrine (cache, preenchido de forma assíncrona). */
  showcase(): any[] {
    return this.showcaseItems;
  }

  /** Descarta o feed memoizado quando o store cresce ou encolhe. */
  invalidate(): void {
    this.cachedFeed = null;
  }

  private invalidateIfStoreChanged(): void {
    const current = app.store.all('discussions').length;
    if (current !== this.cachedStoreSize) {
      this.cachedFeed = null;
      this.cachedStoreSize = current;
    }
  }

  /**
   * Preload da lista de tags, memoizado.
   *
   * A home usa para as categorias e o showcase para resolver id → slug; sem o
   * memo as duas disparariam GET /api/tags em paralelo no mesmo oninit.
   */
  loadTags(): Promise<any> {
    if (this.tagListLoad) return this.tagListLoad;
    const tagList = (app as any).tagList;
    const load: Promise<any> = tagList?.load ? tagList.load(['children', 'parent']).catch(() => []) : Promise.resolve([]);
    this.tagListLoad = load;
    return load;
  }

  /** Busca o feed da home, deduplicando contra o store. */
  loadHome(): Promise<void> {
    const existing = app.store.all('discussions');
    if (existing.length > 0) {
      // Na home o store já vem quente do boot (20 discussões com tags e
      // lastPostedUser). O loadHome() roda no oninit, antes do primeiro view(), então
      // desligar a flag aqui é síncrono e o primeiro paint já sai com os cards, sem
      // flash de skeleton.
      this.homeLoading = false;

      // O payload não traz o firstPost (o Index manda só o linkage) e o card não
      // precisa dele: tudo vem em atributos da discussão. O like usa o linkage
      // (utils/likes).
      this.feedFromBoot();
      return this.fillFeed();
    }
    this.invalidate();
    return app.store
      .find('discussions', { include: apiInclude('user', 'lastPostedUser', 'tags'), 'page[limit]': 20 } as any)
      .then(() => {
        this.homeLoading = false;
        this.fillFeed();
        // Tenta montar a vitrine com o que acabou de chegar ao store.
        if (this.showcaseLoading && !this.showcaseFetched) {
          const fromStore = this.showcaseFromStore();
          if (fromStore.length >= this.showcaseLimit()) {
            this.showcaseItems = fromStore;
            this.cachedFeed = null;
            this.showcaseLoading = false;
            this.showcaseFetched = true;
          }
          // Parcial não pinta: o feed traz só a primeira página e a tag pode ter mais
          // discussões. Marcar `fetched` truncaria o trilho; pintar sem marcar trocaria a
          // grade embaixo do usuário. O fetch por tag, já em voo, dá a palavra final.
        }
        m.redraw();
      })
      .catch(() => {
        this.homeLoading = false;
        m.redraw();
      });
  }

  /**
   * Complemento da lista vindo do payload do boot (Content\PreloadHomeFeed).
   *
   * Roda no oninit, antes do 1º view(): pushPayload insere os models no store
   * sincronamente, então a lista já nasce com a contagem do admin e o
   * `fillFeed` logo em seguida não tem o que buscar.
   */
  private feedFromBoot(): void {
    try {
      const payload = (app as any).data?.avocadoHomeFeed;
      if (!payload?.data?.length || this.feedExtra.length) return;
      const pushed = app.store.pushPayload(payload as any);
      this.feedExtra = (Array.isArray(pushed) ? pushed : [pushed]).filter(Boolean);
      // Só vale para a 1ª entrada na home; voltar a ela usa o store.
      delete (app as any).data.avocadoHomeFeed;
      this.invalidate();
    } catch {
      /* payload malformado — o fillFeed cobre */
    }
  }

  /**
   * Completa a lista quando a contagem do admin passa do que a página do boot
   * cobre: a index traz 20 discussões e as do showcase saem da conta, então
   * com 15 ou 20 itens a lista podia ficar curta. Um GET a mais, só nesse
   * caso; os itens novos entram no fim (ou na ordem da pontuação) depois do
   * 1º paint, que já sai com o que havia.
   */
  fillFeed(): Promise<void> {
    if (this.feedFill) return this.feedFill;

    const count = this.feedCount();
    const available = this.feedCandidates().length;
    // Página do boot incompleta = o fórum não tem mais que isso; nada a buscar.
    if (available >= count || this.allDiscussions().length < INDEX_PAGE_SIZE) return Promise.resolve();

    const sort = this.feedSort() === 'latest' ? '-lastPostedAt' : '';
    const params: Record<string, unknown> = {
      include: SHOWCASE_INCLUDE(),
      'page[limit]': Math.min(FILL_LIMIT, count + INDEX_PAGE_SIZE),
    };
    if (sort) params.sort = sort;

    this.feedFill = app.store
      .find('discussions', params as any)
      .then((items: any) => {
        this.feedExtra = Array.isArray(items) ? items.filter(Boolean) : [];
        this.invalidate();
        m.redraw();
      })
      .catch(() => {
        /* complemento é opcional — a lista fica com o que já tinha */
      });

    return this.feedFill;
  }

  /**
   * Busca o trilho da vitrine. Resolve na hora com o recurso desligado, sem tag
   * configurada, com o trilho vindo do boot (Content\PreloadShowcase, o caminho
   * normal) ou com o store já cobrindo os itens. Senão busca cada tag em
   * paralelo, com o skeleton no ar até o fim: um resultado parcial nunca é pintado.
   */
  loadShowcase(): Promise<void> {
    if (this.showcaseFetched || this.showcaseLoading) return Promise.resolve();
    if (!app.forum?.attribute('avocadoShowcaseEnabled')) {
      this.showcaseFetched = true;
      return Promise.resolve();
    }

    const raw = app.forum?.attribute('avocadoShowcaseTag');
    if (!raw) {
      this.showcaseFetched = true;
      return Promise.resolve();
    }

    let tagIds: string[] = [];
    try {
      const parsed = JSON.parse(raw as string);
      tagIds = (Array.isArray(parsed) ? parsed : [parsed]).map(String).filter(Boolean);
    } catch {
      const s = String(raw).trim();
      if (s) tagIds = [s];
    }
    if (!tagIds.length) {
      this.showcaseFetched = true;
      return Promise.resolve();
    }

    // Payload do boot: síncrono, o 1º paint já sai com os cards definitivos.
    const preloaded = this.showcaseFromBoot();
    if (preloaded.length) {
      this.showcaseItems = preloaded;
      this.cachedFeed = null;
      this.showcaseFetched = true;
      return Promise.resolve();
    }

    this.showcaseLoading = true;
    const expectedCount = this.showcaseLimit();
    const fromStore = this.showcaseFromStore();

    if (fromStore.length >= expectedCount) {
      // Mesmo caso do loadHome(): os itens do showcase saem do store que o boot
      // já preencheu. Resolver síncrono — o skeleton do showcase nunca chega a
      // pintar quando o dado está pronto.
      this.showcaseItems = fromStore;
      this.cachedFeed = null;
      this.showcaseLoading = false;
      this.showcaseFetched = true;
      return Promise.resolve();
    }

    // Store incompleto: ele só vê a primeira página do feed, e discussões da tag
    // fora dela não estão ali (a tag tem 3 discussões e o trilho mostraria 1). O
    // parcial também não pode ser pintado enquanto o fetch corre: a grade pularia
    // de 1 card para 5 colunas. O skeleton (dimensionado por
    // avocadoShowcaseItemCount, calculado no servidor) segura até o resultado final.

    return Promise.all(tagIds.map((id) => this.resolveTagSlug(id)))
      .then((slugs) => slugs.filter(Boolean) as string[])
      .then((slugs) => {
        if (!slugs.length) {
          this.showcaseLoading = false;
          this.showcaseFetched = true;
          return [];
        }
        return Promise.all(slugs.map((slug) => this.fetchShowcaseBySlug(slug)));
      })
      .then((batches) => {
        if (this.showcaseFetched && this.showcaseItems.length) return;
        const seen = new Set<string>();
        const limit = this.showcaseLimit();
        const merged = (batches as any[][])
          .flat()
          .filter(Boolean)
          .filter((d) => {
            const id = d.id?.();
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .sort((a, b) => (new Date(b.createdAt?.()) as any) - (new Date(a.createdAt?.()) as any))
          .slice(0, limit);
        this.showcaseItems = merged;
        this.cachedFeed = null;
        this.showcaseLoading = false;
        this.showcaseFetched = true;
        m.redraw();
      })
      .catch(() => {
        this.showcaseLoading = false;
        this.showcaseFetched = true;
        m.redraw();
      });
  }

  /**
   * Showcase vindo do payload do boot (Content\PreloadShowcase).
   *
   * Roda dentro do oninit, antes do 1º view(): pushPayload insere os models no
   * store sincronamente, então não há skeleton nem re-render. A ordem do `data`
   * já vem do servidor (-createdAt) e é preservada.
   */
  private showcaseFromBoot(): any[] {
    try {
      const payload = (app as any).data?.avocadoShowcase;
      if (!payload?.data?.length) return [];
      const pushed = app.store.pushPayload(payload as any);
      const items = (Array.isArray(pushed) ? pushed : [pushed]).filter(Boolean);
      return items.slice(0, this.showcaseLimit());
    } catch {
      // Payload malformado nunca derruba a home — cai no caminho async.
      return [];
    }
  }

  /** Quantidade de cards configurada no admin (1–5, default 5). */
  private showcaseLimit(): number {
    const n = parseInt(String(app.forum?.attribute('avocadoShowcaseCount') ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
  }

  private showcaseFromStore(): any[] {
    const ids = this.showcaseTagIds();
    if (!ids.size) return [];
    const limit = this.showcaseLimit();
    // `allDiscussions()` devolve as páginas do feed da home quando elas
    // existem; uma discussão do showcase que esteja no store mas fora do feed
    // (preload, navegação anterior) ficaria invisível. Aqui o universo certo é
    // o store inteiro.
    return [...(app.store.all('discussions') as any[])]
      .filter(Boolean)
      .filter((d) => this.isShowcaseDiscussion(d))
      .sort((a, b) => {
        const aSticky = a.isSticky?.() ? 1 : 0;
        const bSticky = b.isSticky?.() ? 1 : 0;
        if (bSticky !== aSticky) return bSticky - aSticky;
        return (new Date(b.createdAt?.()) as any) - (new Date(a.createdAt?.()) as any);
      })
      .slice(0, limit);
  }

  private resolveTagSlug(id: string): Promise<string | null> {
    const fromStore = (): string | null => {
      const tag = (app.store.all('tags') || []).find((t: any) => String(t.id?.()) === id) as any;
      return tag?.slug?.() || null;
    };

    const cached = fromStore();
    if (cached) return Promise.resolve(cached);

    // GET /api/tags/{id} não serve: o slug driver padrão do flarum/tags resolve a
    // rota pela coluna `slug`, e um id numérico dá 404. A listagem é o caminho
    // confiável.
    return this.loadTags()
      .then(() => fromStore())
      .catch(() => null);
  }

  private fetchShowcaseBySlug(slug: string): Promise<any[]> {
    if (!slug) return Promise.resolve([]);
    if (this.showcaseCache[slug]) return Promise.resolve(this.showcaseCache[slug]);
    return app.store
      .find('discussions', {
        filter: { tag: slug },
        include: SHOWCASE_INCLUDE(),
        sort: '-createdAt',
        'page[limit]': this.showcaseLimit(),
      } as any)
      .then((results: any) => {
        const filtered = Array.isArray(results) ? results.filter(Boolean) : [];
        this.showcaseCache[slug] = filtered;
        return filtered;
      })
      .catch(() => []);
  }
}
