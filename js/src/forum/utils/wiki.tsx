/**
 * Compatibilidade com a extensão linkrobins/wiki.
 *
 * As quatro páginas dela (índice, artigo, novo e editar) montam o
 * PageStructure com a classe LinkRobinsWiki-page e trazem o próprio <h1> — no
 * índice ele muda com a categoria e a busca ("Wiki", o nome da categoria,
 * "Resultados para…"). Por isso o cabeçalho de extensão do tema
 * (.AvocadoExtensionPage-header, que repete app.title) não entra nelas: o
 * título seria dito duas vezes, e no artigo o título dele vira o hero da
 * página (ver forum/extensions/Wiki.less).
 *
 * No índice, a sidebar da extensão carrega o botão "Novo artigo" e a lista de
 * categorias. O tema troca a sidebar de toda página de extensão pelo
 * AvocadoNav-helper (invisível no tablet+), então os dois sumiam; aqui ela
 * volta como barra horizontal logo abaixo do cabeçalho — a mesma saída do
 * linkrobins/support (utils/support.tsx), com o mesmo mixin de estilo.
 *
 * No artigo e no editor fica o comportamento padrão do tema: a navegação de
 * volta é a categoria no topo do artigo, e o sumário ocupa a coluna lateral.
 */
import type Mithril from 'mithril';
import { extend, override } from 'flarum/common/extend';
import { trans } from '../utils';

const EXTENSION_ID = 'linkrobins-wiki';

/** Classe que a extensão põe no PageStructure das quatro páginas dela. */
const PAGE_CLASS = 'LinkRobinsWiki-page';

/** A extensão está ativa? Mesma checagem do support e do fof/bookmarks. */
export function wikiEnabled(): boolean {
  return EXTENSION_ID in ((flarum as any)?.extensions ?? {});
}

/** A página atual é uma das do wiki? */
export function isWikiPage(className?: string | null): boolean {
  return !!className && className.includes(PAGE_CLASS) && wikiEnabled();
}

/**
 * O índice do wiki (com ou sem categoria/busca)? O artigo e o editor levam um
 * modificador próprio na mesma className.
 */
export function isWikiIndexPage(className?: string | null): boolean {
  return isWikiPage(className) && !/LinkRobinsWiki-page--(show|compose)/.test(className!);
}

/**
 * A sidebar do índice do wiki, embrulhada para virar a barra de controles.
 *
 * Devolve null fora do índice e quando a página não mandou sidebar — no modo
 * "largura total" do admin ela manda um <div> vazio, que a barra simplesmente
 * não mostra (o botão "Novo artigo" vai então para o cabeçalho da página, pela
 * própria extensão).
 */
export function wikiToolbar(page: any): Mithril.Children {
  if (!isWikiIndexPage(page?.attrs?.className)) return null;

  const sidebar = page?.attrs?.sidebar;

  if (typeof sidebar !== 'function') return null;

  return <div className="AvocadoWiki-toolbar">{sidebar()}</div>;
}

// ── Design do artigo ─────────────────────────────────────────────────────────
// Cada artigo escolhe o próprio design na tela de criação/edição do wiki:
// "Padrão" (o layout da extensão vestido pelo tema) ou "Manual" (manual de
// referência: sumário à esquerda, sobrelinha em mono, título grande e
// linha-fina — ver forum/extensions/Wiki.less, seção 8). O valor viaja como o
// atributo `avocadoWikiStyle` do artigo (Api\WikiArticleFields no PHP).

/** Atributo do artigo na API. */
const STYLE_ATTRIBUTE = 'avocadoWikiStyle';

/** Classe que o PageStructure do artigo ganha no design Manual. */
const MANUAL_CLASS = 'AvocadoWiki-manual';

type WikiStyle = 'default' | 'manual';

const STYLES: { key: WikiStyle; icon: string; label: () => string; help: () => string }[] = [
  {
    key: 'default',
    icon: 'fas fa-file-lines',
    label: () => trans('ramon-avocado.forum.wiki.style_default', 'Default'),
    help: () => trans('ramon-avocado.forum.wiki.style_default_help', 'Contents on the right, the wiki’s own layout.'),
  },
  {
    key: 'manual',
    icon: 'fas fa-book-open',
    label: () => trans('ramon-avocado.forum.wiki.style_manual', 'Manual'),
    help: () => trans('ramon-avocado.forum.wiki.style_manual_help', 'Contents on the left, large title and standfirst.'),
  },
];

/** O design gravado num artigo (padrão quando não há nada). */
export function articleStyle(article: any): WikiStyle {
  return article?.attribute?.(STYLE_ATTRIBUTE) === 'manual' ? 'manual' : 'default';
}

/**
 * O design que a página de criação/edição está mandando salvar agora. A
 * extensão grava o artigo por `createArticle`/`updateArticle`, que montam a
 * lista de atributos sozinhos; os dois chamam `save()` do model na mesma pilha
 * do `_submit` da página, então o `_submit` deixa o valor aqui e o `save()` do
 * WikiArticle o acrescenta (ver installWikiCompat).
 */
let pendingStyle: WikiStyle | null = null;

/** O campo "Design" da página de criação/edição: duas pílulas, como os chips do compositor. */
function styleField(page: any): Mithril.Children {
  const current: WikiStyle = page.avocadoWikiStyle ?? articleStyle(page.article);

  return (
    <div className="Form-group AvocadoWiki-styleField">
      <label>{trans('ramon-avocado.forum.wiki.style_label', 'Design')}</label>
      <div className="AvocadoWiki-styleOptions" role="radiogroup">
        {STYLES.map((style) => (
          <button
            key={style.key}
            type="button"
            role="radio"
            aria-checked={current === style.key ? 'true' : 'false'}
            className={'AvocadoWiki-styleOption' + (current === style.key ? ' is-active' : '')}
            disabled={page.saving}
            onclick={() => {
              page.avocadoWikiStyle = style.key;
            }}
          >
            <i className={style.icon} aria-hidden="true" />
            <span className="AvocadoWiki-styleOption-text">
              <span className="AvocadoWiki-styleOption-label">{style.label()}</span>
              <span className="AvocadoWiki-styleOption-help">{style.help()}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Um módulo da extensão, quando ele carregar (o bundle dela pode vir depois). */
function onWikiModule(path: string, apply: (component: any) => void): void {
  try {
    (flarum as any).reg.onLoad(EXTENSION_ID, path, (module: any) => {
      const component = module?.default ?? module;

      if (component?.prototype) apply(component);
    });
  } catch (e) {
    // Sem registro não há o que remendar: a extensão segue como veio.
  }
}

/**
 * Remendos que precisam dos componentes da extensão.
 *
 * Cada um é guardado por uma checagem do ponto interno que ele envolve
 * (`_renderContent`, `_submit`) — se uma versão futura renomear algum, o tema
 * volta ao comportamento original em vez de quebrar a página.
 *
 * `decorateBody` é o initCodeBlocks do tema (index.tsx): põe o botão de copiar
 * em cada <pre> do artigo, como já acontece nos posts. O corpo do artigo é HTML
 * confiado (m.trust) que a própria página injeta, então o lugar de passar por
 * ele é depois de cada render da página — a função ignora o <pre> que já tem
 * botão, e um artigo novo chega com <pre> novos.
 */
export function installWikiCompat(decorateBody: (root: HTMLElement | null) => void): void {
  if (!wikiEnabled()) return;

  onWikiModule('forum/components/WikiShowPage', (Page) => {
    const decorate = function (this: any) {
      decorateBody(this.element?.querySelector?.('.LinkRobinsWiki-articleBody') ?? null);
    };

    extend(Page.prototype, 'oncreate', decorate);
    extend(Page.prototype, 'onupdate', decorate);

    // O design do artigo vira uma classe no PageStructure. O artigo chega no
    // payload da página no primeiro acesso, então a classe já sai no primeiro
    // render — sem piscar o outro layout.
    extend(Page.prototype, 'view', function (this: any, vnode: any) {
      if (vnode?.attrs && articleStyle(this.article) === 'manual') {
        vnode.attrs.className = `${vnode.attrs.className ?? ''} ${MANUAL_CLASS}`;
      }
    });
  });

  onWikiModule('forum/components/WikiComposePage', (Page) => {
    if (typeof Page.prototype._renderContent !== 'function' || typeof Page.prototype._submit !== 'function') return;

    // O campo entra logo antes do "Conteúdo" — o grupo que vem antes do FAQ,
    // a única peça do formulário com classe própria.
    extend(Page.prototype, '_renderContent', function (this: any, content: any) {
      const form = Array.isArray(content) ? content.find((child: any) => child?.attrs?.className === 'LinkRobinsWiki-form') : null;

      if (!Array.isArray(form?.children)) return;

      const faq = form.children.findIndex((child: any) => String(child?.attrs?.className ?? '').includes('LinkRobinsWiki-faqEditor'));

      form.children.splice(faq > 0 ? faq - 1 : form.children.length, 0, styleField(this));
    });

    override(Page.prototype, '_submit', function (this: any, original: any, ...args: any[]) {
      pendingStyle = this.avocadoWikiStyle ?? articleStyle(this.article);

      try {
        return original(...args);
      } finally {
        pendingStyle = null;
      }
    });
  });

  onWikiModule('common/models/WikiArticle', (Article) => {
    override(Article.prototype, 'save', function (this: any, original: any, attributes: any, ...rest: any[]) {
      if (pendingStyle && attributes && typeof attributes === 'object' && !(STYLE_ATTRIBUTE in attributes)) {
        attributes = { ...attributes, [STYLE_ATTRIBUTE]: pendingStyle };
      }

      return original(attributes, ...rest);
    });
  });
}
