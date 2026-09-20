import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Avatar from 'flarum/common/components/Avatar';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import trustedHtml from '../../common/trustedHtml';
import ChangelogState, { ChangelogFilter } from '../states/ChangelogState';
import { resolveCover } from '../utils/cover';
import { changelogProducts, entryProduct, entryTypes, productTypes, entryVersion, groupByMonth, dayLabel } from '../utils/changelog';
import {
  trans,
  displayName,
  discussionRoute,
  userRoute,
  postPreview,
  getDiscussionHeroImageUrl,
  safeCssColor,
  tagPillStyle,
  renderLoadMore,
  renderEmpty,
} from '../utils';

const changelogRoute = (product: string | null, type: string | null = null): string => {
  const params: Record<string, string> = type ? { type } : {};
  try {
    return product ? app.route('avocado-changelog.product', { product, ...params }) : app.route('avocado-changelog', params);
  } catch {
    return product ? `/changelog/${product}` : '/changelog';
  }
};

/** Clique de navegação que deixa ctrl/cmd/shift/botão do meio abrirem em nova aba. */
const go = (e: MouseEvent, href: string): void => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  m.route.set(href);
};

const routeParam = (name: string): string | null => {
  const value = m.route.param(name);
  return typeof value === 'string' && value ? value : null;
};

/**
 * Changelog do fórum: cada produto é uma tag principal (configurada no admin),
 * cada discussão nela é uma versão, e as sub-tags do produto são os tipos da
 * mudança — nome, cor e ícone vêm da própria tag. A capa é o hero da discussão.
 *
 * O tema deixa a escrita com o Flarum: quem pode publicar é quem pode abrir
 * discussão na tag (permissões por tag do flarum/tags), e as notas completas
 * são o primeiro post.
 */
export default class ChangelogPage extends Page {
  private feed = new ChangelogState();
  private productSlug: string | null = null;
  private typeSlug: string | null = null;

  private openNotes = new Set<string>();
  private notes = new Map<string, string>();
  private notesLoading = new Set<string>();
  private notesFailed = new Set<string>();

  /** Menu "Nova versão" aberto (só existe com mais de um produto para escolher). */
  private createMenuOpen = false;
  private onDocumentClick = (e: Event) => {
    if (this.createMenuOpen && !(e.target as HTMLElement | null)?.closest?.('.AvocadoChangelog-newWrap')) {
      this.createMenuOpen = false;
      m.redraw();
    }
  };

  oninit(vnode: any) {
    super.oninit(vnode);
    this.bodyClass = 'App--index';

    app.setTitle(this.pageTitle());

    this.productSlug = routeParam('product');
    this.typeSlug = routeParam('type');

    // Com o boot presente e sem filtro de tipo (o preload só cobre o produto),
    // a página pinta direto com os cards — sem skeleton.
    if (!this.typeSlug && this.feed.hydrateFromBoot(this.productSlug)) return;

    this.reload();
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);
    document.addEventListener('click', this.onDocumentClick);
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    document.removeEventListener('click', this.onDocumentClick);
  }

  onbeforeupdate() {
    const product = routeParam('product');
    const type = routeParam('type');

    if (product !== this.productSlug || type !== this.typeSlug) {
      this.productSlug = product;
      this.typeSlug = type;
      this.reload();
    }

    return true;
  }

  // ── Dados ───────────────────────────────────────────────────────────────────

  private pageTitle(): string {
    return app.forum.attribute<string>('avocadoChangelogTitle') || trans('ramon-avocado.forum.changelog.title', 'Changelog');
  }

  private filter(products: any[]): ChangelogFilter | null {
    const active = this.productSlug ? products.filter((p) => p.slug?.() === this.productSlug) : products;
    if (!active.length) return null;
    return { productSlugs: active.map((p) => p.slug()), typeSlug: this.typeSlug };
  }

  private async reload(): Promise<void> {
    // O boot nem sempre traz as tags; sem os produtos no store não há slug para filtrar.
    if (!changelogProducts().length) {
      this.feed.loading = true;
      await (app as any).tagList?.load?.(['children', 'parent']).catch(() => []);
    }

    const filter = this.filter(changelogProducts());

    if (!filter) {
      this.feed.settleEmpty();
      m.redraw();
      return;
    }

    await this.feed.load(filter);
  }

  private async loadMore(): Promise<void> {
    const filter = this.filter(changelogProducts());
    if (filter) await this.feed.loadMore(filter);
  }

  private async toggleNotes(discussion: any): Promise<void> {
    const id = String(discussion.id());

    if (this.openNotes.has(id)) {
      this.openNotes.delete(id);
      return;
    }

    this.openNotes.add(id);

    if (this.notes.has(id)) return;

    // O Index só manda o linkage do firstPost; o corpo é buscado sob demanda.
    const postId = discussion.data?.relationships?.firstPost?.data?.id ?? discussion.firstPost?.()?.id?.();

    if (!postId) {
      this.notesFailed.add(id);
      return;
    }

    this.notesFailed.delete(id);
    this.notesLoading.add(id);
    m.redraw();

    try {
      const post: any = await app.store.find('posts', String(postId));
      this.notes.set(id, post.contentHtml?.() ?? '');
    } catch {
      this.notesFailed.add(id);
    } finally {
      this.notesLoading.delete(id);
      m.redraw();
    }
  }

  // ── View ────────────────────────────────────────────────────────────────────

  view() {
    const products = changelogProducts();
    const description =
      app.forum.attribute<string>('avocadoChangelogDescription') ||
      trans('ramon-avocado.forum.changelog.description', "What's new, what's fixed and what's gone — release by release.");

    return (
      <div className="AvocadoChangelog">
        <div className="AvocadoNav-helper">
          <IndexSidebar />
        </div>

        <header className="AvocadoChangelog-header">
          <div className="AvocadoChangelog-headerText">
            <h1 className="AvocadoChangelog-title">{this.pageTitle()}</h1>
            <p className="AvocadoChangelog-description">{description}</p>
          </div>
          {this.renderCreate(products)}
        </header>

        {this.renderProducts(products)}
        {this.renderTypes(products)}
        {this.renderBody(products)}
      </div>
    );
  }

  /**
   * "Nova versão": abre o compositor de discussão em modal, já na tag do produto
   * (e no tipo, se a página está filtrada por um) — é ali que ficam os campos de
   * versão e de capa. Só para quem pode abrir discussão no produto; com mais de
   * um produto possível na visão "todos", vira um menu para escolher.
   */
  private renderCreate(products: any[]) {
    if (!app.session.user) return null;

    const scope = this.productSlug ? products.filter((p) => p.slug?.() === this.productSlug) : products;
    const targets = scope.filter((p) => p.canStartDiscussion?.());
    if (!targets.length) return null;

    const label = trans('ramon-avocado.forum.changelog.new_release', 'New release');

    if (targets.length === 1) {
      return (
        <div className="AvocadoChangelog-newWrap">
          <button type="button" className="AvocadoChangelog-new" onclick={() => this.openComposer(targets[0])}>
            <i className="fas fa-plus" aria-hidden="true" />
            {label}
          </button>
        </div>
      );
    }

    return (
      <div className="AvocadoChangelog-newWrap">
        <button
          type="button"
          className="AvocadoChangelog-new"
          aria-haspopup="menu"
          aria-expanded={this.createMenuOpen ? 'true' : 'false'}
          onclick={() => (this.createMenuOpen = !this.createMenuOpen)}
        >
          <i className="fas fa-plus" aria-hidden="true" />
          {label}
          <i className="fas fa-chevron-down AvocadoChangelog-new-caret" aria-hidden="true" />
        </button>

        {this.createMenuOpen && (
          <div className="AvocadoChangelog-newMenu" role="menu">
            {targets.map((tag: any) => (
              <button
                key={tag.id()}
                type="button"
                role="menuitem"
                className="AvocadoChangelog-newItem"
                style={{ '--tag-color': safeCssColor(tag.color?.()) ?? undefined }}
                onclick={() => this.openComposer(tag)}
              >
                {tag.icon?.() ? (
                  <i className={tag.icon()} aria-hidden="true" />
                ) : (
                  <span className="AvocadoChangelog-product-dot" aria-hidden="true" />
                )}
                {tag.name()}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  private openComposer(product: any): void {
    this.createMenuOpen = false;

    // Com um filtro de tipo ativo a versão nova já nasce daquele tipo.
    const type = this.typeSlug ? productTypes(product).find((t: any) => t.slug?.() === this.typeSlug) : null;
    const tags = type ? [product, type] : [product];

    (app as any).composer
      .load(() => (flarum as any).reg.asyncModuleImport('flarum/forum/components/DiscussionComposer'), { user: app.session.user })
      .then(() => {
        (app as any).composer.fields.tags = tags;
        (app as any).composer.show();
        m.redraw();
      });
  }

  private renderProducts(products: any[]) {
    // Um produto só não precisa de seletor.
    if (products.length < 2) return null;

    const allHref = changelogRoute(null);

    return (
      <nav className="AvocadoChangelog-products" aria-label={trans('ramon-avocado.forum.changelog.products_label', 'Products')}>
        <a className={`AvocadoChangelog-product${this.productSlug ? '' : ' is-active'}`} href={allHref} onclick={(e: MouseEvent) => go(e, allHref)}>
          <i className="fas fa-layer-group" aria-hidden="true" />
          {trans('ramon-avocado.forum.changelog.all_products', 'All products')}
        </a>

        {products.map((tag: any) => {
          const slug = tag.slug();
          const href = changelogRoute(slug);
          const color = safeCssColor(tag.color?.());

          return (
            <a
              key={tag.id()}
              className={`AvocadoChangelog-product${this.productSlug === slug ? ' is-active' : ''}`}
              style={color ? { '--product-color': color } : undefined}
              href={href}
              onclick={(e: MouseEvent) => go(e, href)}
            >
              {tag.icon?.() ? <i className={tag.icon()} aria-hidden="true" /> : <span className="AvocadoChangelog-product-dot" aria-hidden="true" />}
              {tag.name()}
            </a>
          );
        })}
      </nav>
    );
  }

  private renderTypes(products: any[]) {
    const product = this.productSlug ? products.find((p) => p.slug?.() === this.productSlug) : null;
    const types = productTypes(product);

    if (!types.length) return null;

    const clearHref = changelogRoute(this.productSlug);

    return (
      <div className="AvocadoChangelog-types" role="group" aria-label={trans('ramon-avocado.forum.changelog.types_label', 'Filter by type')}>
        <a
          className={`AvocadoChangelog-type AvocadoChangelog-type--all${this.typeSlug ? '' : ' is-active'}`}
          href={clearHref}
          onclick={(e: MouseEvent) => go(e, clearHref)}
        >
          {trans('ramon-avocado.forum.changelog.all_types', 'All types')}
        </a>

        {types.map((tag: any) => {
          const href = changelogRoute(this.productSlug, tag.slug());

          return (
            <a
              key={tag.id()}
              className={`AvocadoChangelog-type${this.typeSlug === tag.slug() ? ' is-active' : ''}`}
              style={tagPillStyle(safeCssColor(tag.color?.()), 0.12)}
              href={href}
              onclick={(e: MouseEvent) => go(e, href)}
            >
              {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
              {tag.name()}
            </a>
          );
        })}
      </div>
    );
  }

  private renderBody(products: any[]) {
    const state = this.feed;

    if (this.productSlug && !state.loading && !products.some((p) => p.slug?.() === this.productSlug)) {
      return this.renderNotFound();
    }

    if (state.loading) return this.renderSkeleton();

    if (state.failed && !state.entries.length) {
      return (
        <div className="AvocadoChangelog-error">
          <p>{trans('ramon-avocado.forum.changelog.error', 'Could not load the changelog.')}</p>
          <button type="button" className="AvocadoChangelog-retry" onclick={() => this.reload()}>
            {trans('ramon-avocado.forum.changelog.retry', 'Try again')}
          </button>
        </div>
      );
    }

    if (!state.entries.length) {
      return renderEmpty(
        this.typeSlug
          ? trans('ramon-avocado.forum.changelog.empty_filtered', 'No releases of this type yet.')
          : trans('ramon-avocado.forum.changelog.empty', 'No releases published yet.')
      );
    }

    return (
      <div className="AvocadoChangelog-body">
        {this.renderTimeline(products)}
        {state.loadingMore && this.renderSkeleton(1)}
        {state.hasMore && !state.loadingMore && renderLoadMore(trans('ramon-avocado.forum.changelog.load_more', 'Load more'), () => this.loadMore())}
      </div>
    );
  }

  private renderNotFound() {
    const href = changelogRoute(null);

    return (
      <div className="AvocadoChangelog-error">
        <p>{trans('ramon-avocado.forum.changelog.not_found', 'Product not found.')}</p>
        <a className="AvocadoChangelog-retry" href={href} onclick={(e: MouseEvent) => go(e, href)}>
          {trans('ramon-avocado.forum.changelog.all_products', 'All products')}
        </a>
      </div>
    );
  }

  private renderSkeleton(count = 3) {
    return (
      <div className="AvocadoChangelog-skeleton" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="AvocadoChangelog-entry">
            <div className="AvocadoChangelog-when">
              <span className="AvocadoChangelog-shimmer AvocadoChangelog-shimmer--version" />
              <span className="AvocadoChangelog-shimmer AvocadoChangelog-shimmer--date" />
            </div>
            <div className="AvocadoChangelog-card">
              <div className="AvocadoChangelog-cardBody">
                <span className="AvocadoChangelog-shimmer AvocadoChangelog-shimmer--pills" />
                <span className="AvocadoChangelog-shimmer AvocadoChangelog-shimmer--title" />
                <span className="AvocadoChangelog-shimmer AvocadoChangelog-shimmer--line" />
                <span className="AvocadoChangelog-shimmer AvocadoChangelog-shimmer--line AvocadoChangelog-shimmer--short" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  private renderTimeline(products: any[]) {
    const entries: any[] = this.feed.entries;

    // A versão mais recente de cada produto ganha o selo "Mais recente" — só sem
    // filtro de tipo, onde "a primeira da lista" ainda quer dizer "a última lançada".
    const latest = new Set<string>();
    if (!this.typeSlug) {
      const seen = new Set<string>();
      entries.forEach((d) => {
        const product = entryProduct(d, products);
        const key = product ? String(product.id()) : '';
        if (key && !seen.has(key)) {
          seen.add(key);
          latest.add(String(d.id()));
        }
      });
    }

    const groups = groupByMonth(entries, (d) => (d.createdAt?.() as Date | undefined) ?? null);

    return (
      <div className="AvocadoChangelog-timeline">
        {groups.map((group) => (
          <section key={group.key} className="AvocadoChangelog-group">
            <h2 className="AvocadoChangelog-month">{group.label}</h2>
            <div className="AvocadoChangelog-list">{group.items.map((d) => this.renderEntry(d, products, latest.has(String(d.id()))))}</div>
          </section>
        ))}
      </div>
    );
  }

  private renderEntry(discussion: any, products: any[], isLatest: boolean) {
    const id = String(discussion.id());
    const version = entryVersion(discussion);
    const headline: string = discussion.title?.() || '';
    const created = discussion.createdAt?.() as Date | undefined;
    const product = entryProduct(discussion, products);
    const types = entryTypes(discussion, product);
    const color = safeCssColor(product?.color?.());
    const href = discussionRoute(discussion);
    // Capa, do mais explícito para o mais discreto: a imagem do hero da
    // discussão; as cores que a versão escolheu no compositor (automática, uma ou
    // várias tags, ou uma predefinição); e, sem nenhum dos dois, a primeira
    // imagem do post.
    const heroImage = getDiscussionHeroImageUrl(discussion);
    const colorCover = heroImage ? null : resolveCover(discussion.attribute?.('changelogCover'), discussion.tags?.() || []);
    const cover = heroImage || (colorCover ? null : (discussion.attribute?.('avocadoFirstImageUrl') as string | null)) || null;
    const excerpt = postPreview(discussion, 260);
    const author = discussion.user?.();
    const replies = Math.max(0, (Number(discussion.commentCount?.()) || 1) - 1);
    const open = this.openNotes.has(id);

    return (
      <article key={id} className="AvocadoChangelog-entry" style={color ? { '--product-color': color } : undefined}>
        <div className="AvocadoChangelog-when">
          {version && <span className="AvocadoChangelog-version">{version}</span>}
          {created && (
            <time className="AvocadoChangelog-date" dateTime={created.toISOString()}>
              {dayLabel(created)}
            </time>
          )}
        </div>

        <div className="AvocadoChangelog-card">
          {cover && (
            <a className="AvocadoChangelog-cover" href={href} onclick={(e: MouseEvent) => go(e, href)} tabindex="-1" aria-hidden="true">
              <img src={cover} alt="" loading="lazy" decoding="async" />
            </a>
          )}

          {colorCover && (
            <a
              className="AvocadoChangelog-cover AvocadoChangelog-cover--color"
              style={colorCover.gradient ? { background: colorCover.gradient } : undefined}
              href={href}
              onclick={(e: MouseEvent) => go(e, href)}
              tabindex="-1"
              aria-hidden="true"
            >
              {colorCover.icon && <i className={`AvocadoChangelog-coverIcon ${colorCover.icon}`} />}
            </a>
          )}

          <div className="AvocadoChangelog-cardBody">
            <div className="AvocadoChangelog-labels">
              {isLatest && <span className="AvocadoChangelog-latest">{trans('ramon-avocado.forum.changelog.latest', 'Latest')}</span>}
              {!this.productSlug && product && (
                <span className="AvocadoChangelog-productLabel">
                  {product.icon?.() && <i className={product.icon()} aria-hidden="true" />}
                  {product.name()}
                </span>
              )}
              {types.map((tag: any) => (
                <span key={tag.id()} className="AvocadoChangelog-typePill" style={tagPillStyle(safeCssColor(tag.color?.()), 0.12)}>
                  {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                  {tag.name()}
                </span>
              ))}
            </div>

            <h3 className="AvocadoChangelog-entryTitle">
              <a href={href} onclick={(e: MouseEvent) => go(e, href)}>
                {headline}
              </a>
            </h3>

            {excerpt && !open && <p className="AvocadoChangelog-excerpt">{excerpt}</p>}

            {this.renderNotes(id)}

            <footer className="AvocadoChangelog-foot">
              {author && (
                <a className="AvocadoChangelog-author" href={userRoute(author)} onclick={(e: MouseEvent) => go(e, userRoute(author))}>
                  <Avatar user={author} />
                  <span>{displayName(author)}</span>
                </a>
              )}

              <a
                className="AvocadoChangelog-replies"
                href={href}
                onclick={(e: MouseEvent) => go(e, href)}
                aria-label={trans('ramon-avocado.forum.changelog.replies', '{count} replies', { count: replies })}
              >
                <i className="far fa-comment" aria-hidden="true" />
                {replies}
              </a>

              <button
                type="button"
                className={`AvocadoChangelog-toggle${open ? ' is-open' : ''}`}
                aria-expanded={open ? 'true' : 'false'}
                onclick={() => this.toggleNotes(discussion)}
              >
                {open
                  ? trans('ramon-avocado.forum.changelog.hide_notes', 'Hide notes')
                  : trans('ramon-avocado.forum.changelog.read_notes', 'Read the notes')}
                <i className="fas fa-chevron-down" aria-hidden="true" />
              </button>
            </footer>
          </div>
        </div>
      </article>
    );
  }

  private renderNotes(id: string) {
    if (!this.openNotes.has(id)) return null;

    if (this.notesLoading.has(id)) {
      return <p className="AvocadoChangelog-notesState">{trans('ramon-avocado.forum.changelog.notes_loading', 'Loading notes…')}</p>;
    }

    if (this.notesFailed.has(id)) {
      return <p className="AvocadoChangelog-notesState">{trans('ramon-avocado.forum.changelog.notes_failed', 'Could not load the notes.')}</p>;
    }

    const html = this.notes.get(id);

    return html ? <div className="AvocadoChangelog-notes Post-body">{trustedHtml(html)}</div> : null;
  }
}
