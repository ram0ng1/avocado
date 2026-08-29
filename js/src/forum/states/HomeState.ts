import app from 'flarum/forum/app';
import { numberOr } from '../utils';

const SHOWCASE_INCLUDE = 'user,firstPost,lastPostedUser,lastPost,tags';

/** Teto de posts por request de hidratação (ver `hydrateFirstPosts`). */
const HYDRATE_LIMIT = 50;

/**
 * State for the Avocado home page.
 *
 * Owns:
 *  - The cached "popular" / "latest" / "topCategories" computations.
 *  - The async showcase-discussions fetch and its per-slug cache.
 *  - The showcase tag-ID parsing from `app.forum.attribute('avocadoShowcaseTag')`.
 *
 * The page itself only reads these getters; it never calls `app.store` directly.
 */
export default class HomeState {
  homeLoading = true;
  showcaseLoading = false;

  private showcaseItems: any[] = [];
  private showcaseFetched = false;
  private showcaseCache: Record<string, any[]> = {};

  /** Request de hidratação dos firstPosts em voo (dedup entre home e showcase). */
  private firstPostsHydration: Promise<void> | null = null;

  /** Preload da lista de tags em voo (dedup entre a home e o showcase). */
  private tagListLoad: Promise<any> | null = null;

  // Memoization — invalidated when the store discussion count changes.
  private cachedPopular: any[] | null = null;
  private cachedLatest: any[] | null = null;
  private cachedStoreSize = -1;

  // ── Read-only getters ──────────────────────────────────────────────────

  /** All discussions currently in the store, robust to paged-vs-flat shape. */
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
   * Popularity score: weighted sum of replies, likes, views, with a recency
   * bonus that decays linearly across one week.
   */
  discussionScore(d: any): number {
    const replyCount = numberOr(d.replyCount?.(), 0);
    const likeCount = numberOr(d.firstPost?.()?.attribute?.('likesCount'), 0);
    const views = numberOr(d.attribute?.('viewCount'), 0);
    const lastPostedAt = d.lastPostedAt?.();
    const ageMs = lastPostedAt ? Date.now() - new Date(lastPostedAt).getTime() : Infinity;
    const recency = Math.max(0, 1 - ageMs / (7 * 24 * 3600 * 1000));
    return replyCount * 2 + likeCount * 3 + views * 0.1 + recency * 20;
  }

  /** IDs of tags configured as the showcase source. */
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

  /** Discussions for the "Popular" / "Following" rail. */
  popularDiscussions(limit = 5): any[] {
    this.invalidateIfStoreChanged();
    if (this.cachedPopular?.length) return this.cachedPopular;

    const result = [...this.allDiscussions()]
      .filter((d) => !this.isShowcaseDiscussion(d))
      .sort((a, b) => {
        const aSticky = a.isSticky?.() ? 1 : 0;
        const bSticky = b.isSticky?.() ? 1 : 0;
        if (bSticky !== aSticky) return bSticky - aSticky;
        return this.discussionScore(b) - this.discussionScore(a);
      })
      .slice(0, limit);

    if (result.length > 0) this.cachedPopular = result;
    return result;
  }

  /** Discussions sorted by most-recent activity. */
  latestDiscussions(): any[] {
    this.invalidateIfStoreChanged();
    if (this.cachedLatest?.length) return this.cachedLatest;

    const result = [...this.allDiscussions()]
      .sort((a, b) => {
        const aDate = a.lastPostedAt?.() ? new Date(a.lastPostedAt()) : new Date(0);
        const bDate = b.lastPostedAt?.() ? new Date(b.lastPostedAt()) : new Date(0);
        return (bDate as any) - (aDate as any);
      })
      .slice(0, 10);

    if (result.length > 0) this.cachedLatest = result;
    return result;
  }

  /** Top-level tags sorted by their admin-defined position. */
  topCategories(limit = 7): any[] {
    try {
      const tags = (app.store.all('tags') as any[]).filter((t) => t && !t.parent?.());
      return tags.sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999)).slice(0, limit);
    } catch {
      return [];
    }
  }

  /** Showcase discussions (cached, asynchronously populated). */
  showcase(): any[] {
    return this.showcaseItems;
  }

  // ── Mutating actions ───────────────────────────────────────────────────

  /** Drop memoized popular/latest when the store grows or shrinks. */
  invalidate(): void {
    this.cachedPopular = null;
    this.cachedLatest = null;
  }

  private invalidateIfStoreChanged(): void {
    const current = app.store.all('discussions').length;
    if (current !== this.cachedStoreSize) {
      this.cachedPopular = null;
      this.cachedLatest = null;
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

  /** Fetch the home feed (deduplicates against existing store contents). */
  loadHome(): Promise<void> {
    const existing = app.store.all('discussions');
    if (existing.length > 0) {
      // O store já está quente — na home isso é o caso NORMAL, não a exceção: o
      // apiDocument do boot da index traz 20 discussions com firstPost, tags e
      // lastPostedUser. Como loadHome() roda no oninit, antes do primeiro
      // view(), desligar a flag aqui é síncrono e o 1º paint já sai com os
      // cards. A versão anterior segurava o skeleton por 350ms com um
      // setTimeout, o que produzia exatamente o flash que ele tentava evitar —
      // skeleton visível e depois substituído, com o dado pronto o tempo todo.
      this.homeLoading = false;

      // ...só que esse payload NÃO traz o firstPost: desde a série 2.0 RC o
      // Index serializa apenas o *linkage* `firstPost` e deixa os posts fora do
      // `included`. Descrição e capa não dependem mais disso (vêm em
      // `avocadoExcerpt`/`avocadoFirstImageUrl`, no próprio payload da
      // discussão), mas o botão de curtir ainda precisa do post em si: sem ele
      // o contador fica em 0 e o clique não faz nada. Busca em segundo plano,
      // fora do caminho do primeiro paint.
      return this.hydrateFirstPosts();
    }
    this.invalidate();
    return app.store
      .find('discussions', { include: ['user', 'lastPostedUser', 'tags', 'firstPost'], 'page[limit]': 20 } as any)
      .then(() => {
        this.homeLoading = false;
        // Attempt to populate showcase from the newly-fetched store as a side-effect.
        if (this.showcaseLoading && !this.showcaseFetched) {
          const fromStore = this.showcaseFromStore();
          if (fromStore.length >= this.showcaseLimit()) {
            this.showcaseItems = fromStore;
            this.showcaseLoading = false;
            this.showcaseFetched = true;
          }
          // Parcial não pinta: o feed da home traz só a 1ª página, então a tag
          // pode ter mais discussões do que couberam nela. Marcar `fetched`
          // aqui truncava o trilho no que o store por acaso tivesse; pintar
          // sem marcar trocava a grade embaixo do usuário. O fetch por tag,
          // já em voo, dá a palavra final.
        }
        m.redraw();
      })
      .catch(() => {
        this.homeLoading = false;
        m.redraw();
      });
  }

  /**
   * Traz para o store os `firstPost` das discussões que só têm o linkage.
   *
   * Um único GET /api/posts?filter[id]=… cobre a página inteira — mesmo dado
   * que um `include=firstPost` traria, sem repetir as discussions nem as
   * relações que já estão no store, e sem N+1 (um request, não um por card).
   *
   * O que depende disto é o estado de curtida do card (contador e clique);
   * descrição e capa já vêm no payload da discussão, então nada do que está
   * pintado muda quando a resposta chega — não é o flash que
   * docs/preload-sem-flash.md descreve.
   */
  hydrateFirstPosts(): Promise<void> {
    if (this.firstPostsHydration) return this.firstPostsHydration;

    const ids: string[] = [];
    const seen = new Set<string>();

    for (const d of this.allDiscussions()) {
      if (ids.length >= HYDRATE_LIMIT) break;
      try {
        // Já resolvido no store (veio de um fetch com include): nada a fazer.
        if (d.firstPost?.()) continue;
        const id = String(d.data?.relationships?.firstPost?.data?.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      } catch {
        /* modelo malformado — ignora a linha, nunca derruba a home */
      }
    }

    if (!ids.length) return Promise.resolve();

    this.firstPostsHydration = app.store
      .find('posts', ids, { 'page[limit]': ids.length } as any)
      .then(() => {
        // Os posts entram no store e o linkage que já existia passa a resolver;
        // os memos de popular/latest guardam os mesmos modelos, mas invalidar
        // mantém a ordenação por score coerente com os likes recém-chegados.
        this.invalidate();
        m.redraw();
      })
      .catch(() => {
        /* sem excerpt é degradação aceitável — o card continua clicável */
      });

    return this.firstPostsHydration;
  }

  /**
   * Fetch the showcase rail.
   *
   * Resolves synchronously when:
   *  - the showcase feature is disabled,
   *  - no showcase tag is configured,
   *  - o boot trouxe o trilho pronto (Content\PreloadShowcase — caminho
   *    normal, e o único sem skeleton), ou
   *  - the store already holds enough showcase items.
   *
   * Otherwise fetches each configured tag's slug + discussions in parallel
   * and merges the results into `this.showcaseItems`, mantendo o skeleton no
   * ar até lá — um resultado parcial nunca é pintado.
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
      this.showcaseLoading = false;
      this.showcaseFetched = true;
      return this.hydrateFirstPosts();
    }

    // Store incompleto: ele só enxerga a primeira página do feed da home, e as
    // discussões da tag de showcase que ficaram fora dela simplesmente não
    // estão ali. Aceitar esse subconjunto como resultado final era o bug de
    // "a tag tem 3 discussões mas o trilho mostra 1".
    //
    // E o parcial também não pode ser PINTADO enquanto o fetch corre: a grade
    // sairia com 1 card ocupando a linha inteira e depois viraria 5 colunas,
    // que é exatamente o salto que o skeleton existe para evitar. Segura o
    // skeleton (dimensionado por avocadoShowcaseItemCount, que o servidor
    // calcula com a contagem real) até o resultado definitivo chegar.

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

    // GET /api/tags/{id} não serve aqui: o slug driver padrão do flarum/tags
    // (Utf8SlugDriver) resolve a rota pela coluna `slug`, então um id numérico
    // devolve 404 e o trilho ficava vazio. A listagem é o caminho confiável.
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
        include: SHOWCASE_INCLUDE,
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
