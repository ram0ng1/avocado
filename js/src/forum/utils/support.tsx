/**
 * Compatibilidade com a extensão linkrobins/support.
 *
 * As três páginas dela (lista de tickets, novo ticket e ticket) montam o
 * PageStructure com uma sidebar própria — e é nessa sidebar que moram o botão
 * "Novo ticket" (App-primaryControl) e os filtros de status. O tema troca a
 * sidebar de toda página de extensão pelo AvocadoNav-helper, que é
 * `display:none` no tablet+, então os dois sumiam da tela: sobrava a lista de
 * tickets sem nenhuma forma de abrir um.
 *
 * A saída aqui é reaproveitar a sidebar da própria extensão — o vnode que ela
 * passa em `attrs.sidebar` — e remontá-la como barra horizontal logo abaixo do
 * cabeçalho da página (ver Support.less). Os componentes continuam sendo os
 * dela, então permissão, rótulo, rota e estado ativo seguem sendo problema da
 * extensão; o tema só decide onde a barra aparece e com que cara.
 *
 * No telefone nada disso importa: o core posiciona `.App-primaryControl` e
 * `.App-titleControl` de forma absoluta no cabeçalho do aparelho, exatamente
 * como faz na home, e a barra fica com altura zero.
 */
import type Mithril from 'mithril';
import app from 'flarum/forum/app';
import Avatar from 'flarum/common/components/Avatar';
import Button from 'flarum/common/components/Button';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import humanTime from 'flarum/common/helpers/humanTime';
import { extend, override } from 'flarum/common/extend';
import { renderSupportCategoriesSkeleton, renderSupportListSkeleton, renderSupportTicketSkeleton } from '../components/Skeletons';
import { hexLuminance, tagPillStyle, trans } from '../utils';

const EXTENSION_ID = 'linkrobins-support';

/** Classe que a extensão põe no PageStructure das três páginas dela. */
const PAGE_CLASS = 'LinkRobinsSupport-page';

/**
 * A extensão está ativa?
 *
 * `flarum.extensions` já está completo quando os initializers rodam — mesma
 * checagem que o tema faz para o fof/bookmarks e o flarum/tags.
 */
export function supportEnabled(): boolean {
  return EXTENSION_ID in ((flarum as any)?.extensions ?? {});
}

/** A página atual é uma das do support? */
export function isSupportPage(className?: string | null): boolean {
  return !!className && className.includes(PAGE_CLASS) && supportEnabled();
}

/**
 * A sidebar da extensão, embrulhada para virar a barra de controles da página.
 *
 * Recebe a instância do PageStructure porque é lá que vivem a className e o
 * `attrs.sidebar` passados pela página do support. Devolve null em qualquer
 * outra página, e também quando a página não mandou sidebar nenhuma — a
 * extensão sempre manda, mas uma versão futura pode deixar de mandar e isso
 * não pode derrubar o render.
 */
export function supportToolbar(page: any): Mithril.Children {
  if (!isSupportPage(page?.attrs?.className)) return null;

  const sidebar = page?.attrs?.sidebar;

  if (typeof sidebar !== 'function') return null;

  return <div className="AvocadoSupport-toolbar">{sidebar()}</div>;
}

/** Um módulo da extensão, pelo registro de módulos (null quando ausente). */
function supportModule(path: string): any {
  try {
    return (flarum as any).reg.get(EXTENSION_ID, path) ?? null;
  } catch (e) {
    return null;
  }
}

// ── Novo ticket pelo composer ────────────────────────────────────────────────
// A extensão abre um ticket em duas telas: /support/new pede a categoria, depois
// o assunto, e só então solta o composer do Flarum. No tema o botão "Novo
// ticket" abre o composer direto, com a categoria e o assunto no cabeçalho dele
// — é onde o fórum escreve qualquer outra coisa.
//
// Tudo o que decide o resultado continua sendo da extensão: as categorias vêm
// da API dela, o corpo é o composer dela (com os editores que o fórum tiver) e
// a criação passa pelo mesmo createTicket, que grava ticket e primeira mensagem
// numa transação só.

const newTicket: { subject: string; categoryId: string; categories: any[]; loading: boolean } = {
  subject: '',
  categoryId: '',
  categories: [],
  loading: false,
};

function loadTicketCategories(api: any): void {
  if (newTicket.loading || newTicket.categories.length) return;

  newTicket.loading = true;

  api
    .loadCategories()
    .then((categories: any[]) => {
      newTicket.categories = categories || [];
      newTicket.loading = false;

      // Uma categoria só não é escolha nenhuma.
      if (newTicket.categories.length === 1) newTicket.categoryId = String(newTicket.categories[0].id());

      m.redraw();
    })
    .catch(() => {
      newTicket.loading = false;
      m.redraw();
    });
}

function chosenCategory(): any {
  return newTicket.categories.find((category: any) => String(category.id()) === newTicket.categoryId) ?? null;
}

/** Só cores hexadecimais entram no style inline — o valor vem do admin. */
function safeColor(value: unknown): string | null {
  const color = typeof value === 'string' ? value.trim() : '';

  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : null;
}

/**
 * O cabeçalho do composer, na forma que o Flarum usa para uma discussão nova:
 * identidade do que se está escrevendo, o assunto como título e a categoria
 * como chip logo abaixo — no lugar dos dois campos de formulário soltos.
 */
function newTicketHeaderItems(tr: any): any[] {
  const category = chosenCategory();
  const color = safeColor(category?.color?.());
  const tint = color ? `--avocado-support-cat: ${color}` : undefined;

  return [
    {
      name: 'avocadoTicketHeading',
      priority: 20,
      content: (
        <h3 className="AvocadoSupport-composerHeading" style={tint}>
          <span className="AvocadoSupport-composerHeading-icon">
            <i className={category?.icon?.() || 'fas fa-life-ring'} aria-hidden="true" />
          </span>
          {trans('ramon-avocado.forum.support.new_ticket_heading', 'New ticket')}
        </h3>
      ),
    },
    {
      name: 'avocadoTicketSubject',
      priority: 10,
      content: (
        <input
          className="FormControl AvocadoSupport-composerSubject"
          type="text"
          value={newTicket.subject}
          maxlength={200}
          placeholder={tr('compose.subject_placeholder', 'Short summary of your issue')}
          aria-label={tr('compose.subject_label', 'Subject')}
          oninput={(e: any) => {
            newTicket.subject = e.target.value;
          }}
        />
      ),
    },
    {
      name: 'avocadoTicketCategory',
      priority: 5,
      content: (
        <div className="AvocadoSupport-composerCategoryRow" style={tint}>
          {!newTicket.categories.length ? (
            // Sem categorias ainda: um chip do tamanho do que vem aí, com o
            // mesmo brilho dos demais esqueletos. Escrever "carregando…" e
            // trocar por "Escolha uma categoria" seria o flash que se quer
            // evitar; um rótulo que muda sozinho também confunde o leitor de
            // tela, por isso o espaço reservado é aria-hidden.
            <span className="AvocadoSupport-composerCategory--loading" aria-hidden="true" />
          ) : (
            <SelectDropdown
              className="AvocadoSupport-composerCategory"
              buttonClassName="Button"
              defaultLabel={trans('ramon-avocado.forum.support.category_placeholder', 'Choose a category')}
              accessibleToggleLabel={trans('ramon-avocado.forum.support.category_label', 'Ticket category')}
            >
              {newTicket.categories.map((option: any) => (
                <Button
                  key={option.id()}
                  icon={option.icon() || 'fas fa-life-ring'}
                  active={String(option.id()) === newTicket.categoryId}
                  onclick={() => {
                    newTicket.categoryId = String(option.id());
                  }}
                >
                  {option.name()}
                </Button>
              ))}
            </SelectDropdown>
          )}
        </div>
      ),
    },
  ];
}

function submitNewTicket(modules: any, content: string, body: any): void {
  const { api, helpers, translate } = modules;
  const tr = translate.tr;
  const fail = (message: any) => (helpers?.showError ? helpers.showError(message) : app.alerts.show({ type: 'error' }, message));
  const category = chosenCategory();
  const subject = newTicket.subject.trim();

  if (!subject) return fail(tr('compose.subject_first', 'Please enter a subject for your ticket.'));
  if (!category) return fail(tr('compose.choose_category', 'Choose a category to get started.'));
  if (!content || !content.trim()) return fail(tr('errors.empty_body', 'Please write your message before submitting.'));

  body.loading = true;
  m.redraw();

  api
    .createTicket(subject, category, content)
    .then((ticket: any) => {
      newTicket.subject = '';
      newTicket.categoryId = newTicket.categories.length === 1 ? newTicket.categoryId : '';
      body.composer?.hide();

      const base = helpers?.BASE_PATH ?? '/support';

      m.route.set(ticket?.id?.() ? `${base}/${encodeURIComponent(ticket.id())}` : base);
    })
    .catch((error: any) => {
      body.loading = false;
      console.error('[avocado] falha ao abrir o ticket pelo composer:', error);
      fail(tr('errors.submit_ticket', 'Could not submit the ticket.'));
      m.redraw();
    });
}

/**
 * Abre o composer de novo ticket. Devolve false quando não dá para assumir o
 * fluxo — sem os módulos da extensão, sem o composer do core (instalação
 * enxuta) ou com o usuário suspenso, caso em que a página dela trata a
 * apelação (categorias filtradas, aviso de quem não pode apelar).
 */
export function openNewTicketComposer(): boolean {
  const composer = supportModule('forum/utils/composer');
  const api = supportModule('forum/utils/api');
  const helpers = supportModule('forum/utils/helpers');
  const permissions = supportModule('forum/utils/permissions');
  const translate = supportModule('forum/utils/translate');

  if (!composer?.openSupportComposer || !api?.createTicket || !api?.loadCategories || !translate?.tr) return false;
  if (!composer.supportComposerSupported?.()) return false;
  if (permissions?.isUserSuspended?.()) return false;

  const tr = translate.tr;

  loadTicketCategories(api);

  return (
    composer.openSupportComposer({
      // Marcador próprio: a página /support/new usa 'new-ticket' para saber que
      // o composer é dela, e este rascunho tem assunto e categoria próprios.
      supportContext: 'avocado-new-ticket',
      className: 'LinkRobinsSupport-ticketComposer AvocadoSupport-ticketComposer',
      placeholder: tr('compose.body_placeholder', 'Describe the issue in detail. Markdown is supported.'),
      submitLabel: tr('compose.submit', 'Submit ticket'),
      confirmExit: tr('compose.discard_confirm', 'You have an unsubmitted ticket. Discard it?'),
      originalContent: '',
      supportHeaderItems: () => newTicketHeaderItems(tr),
      onSupportSubmit: (content: string, body: any) => submitNewTicket({ api, helpers, translate }, content, body),
    }) !== false
  );
}

// ── Página do ticket no formato da discussão ─────────────────────────────────
// A extensão desenha o ticket como um formulário: cabeçalho de texto e cada
// resposta num cartão. No tema ele passa a ter a mesma cara de uma discussão:
// o hero colorido no topo (cor da categoria, voltar, selos, título, quem
// participou) e as respostas como linhas limpas com a coluna do avatar.

const TICKET_PAGE_CLASS = 'AvocadoSupport-ticketPage';
const MAX_HERO_AVATARS = 6;

/** Cor de texto do hero pelo contraste da cor de fundo — mesma regra da discussão. */
function heroPalette(background: string | null): Record<string, string> {
  const light = !!background && background.replace('#', '').length === 6 && hexLuminance(background) > 0.35;

  return {
    '--discussion-color': background ?? 'var(--primary-color)',
    '--disc-hero-text': light ? '#202126' : '#ffffff',
    '--disc-hero-text-muted': light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.78)',
    '--disc-hero-surface': light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.20)',
  };
}

/** Quem falou no ticket: autor primeiro, depois cada respondente, sem repetir. */
function ticketParticipants(page: any): any[] {
  const seen = new Set<string>();
  const people: any[] = [];
  const add = (user: any) => {
    const id = user?.id?.();

    if (!id || seen.has(String(id))) return;

    seen.add(String(id));
    people.push(user);
  };

  add(page.ticket?.user?.());
  (page.replies ?? []).forEach((reply: any) => add(reply?.user?.()));

  return people;
}

function renderTicketHero(page: any): Mithril.Children {
  const ticket = page.ticket;
  const status = supportModule('forum/utils/status');
  const helpers = supportModule('forum/utils/helpers');
  const translate = supportModule('forum/utils/translate');
  const tr = translate?.tr ?? ((_key: string, fallback: string) => fallback);
  const category = ticket.category?.();
  const categoryColor = safeColor(category?.color?.());
  const participants = ticketParticipants(page);
  const shown = participants.slice(0, MAX_HERO_AVATARS);
  const extra = participants.length - shown.length;
  const replies = (page.replies ?? []).length;
  const author = ticket.user?.();
  const base = helpers?.BASE_PATH ?? '/support';

  return (
    <div className="DiscussionHero AvocadoSupport-hero" style={heroPalette(categoryColor)}>
      <div className="DiscussionHero-inner">
        <nav className="DiscussionHero-nav">
          <button
            className="DiscussionHero-back"
            onclick={() => {
              if (window.history.length > 1) window.history.back();
              else m.route.set(base);
            }}
            aria-label={trans('ramon-avocado.forum.back', 'Back')}
          >
            <i className="fas fa-arrow-left" aria-hidden="true" />
          </button>

          <div className="DiscussionHero-pills">
            {status?.statusBadge ? status.statusBadge(ticket.status()) : null}
            {ticket.isDeleted?.() ? (
              <span className="LinkRobinsSupport-status AvocadoSupport-heroDeleted">
                <i className="fas fa-trash" aria-hidden="true" /> {tr('show.deleted_badge', 'Deleted')}
              </span>
            ) : null}
            {category ? (
              <span className="AvocadoHome-tagPill" style={tagPillStyle(categoryColor, 0.12)}>
                {category.icon?.() ? <i className={category.icon()} aria-hidden="true" /> : null}
                {category.name?.()}
              </span>
            ) : null}
            {ticket.decision?.() && status?.decisionLabel ? (
              <span className={`AvocadoSupport-heroDecision AvocadoSupport-heroDecision--${ticket.decision()}`}>
                {tr('show.decision', 'Decision:')} {status.decisionLabel(ticket.decision())}
              </span>
            ) : null}
          </div>
        </nav>

        <h1 className="DiscussionHero-title">{ticket.subject?.()}</h1>

        <div className="DiscussionHero-meta">
          {shown.length > 0 ? (
            <div className="DiscussionHero-participants">
              {shown.map((user: any) => (
                <span key={user.id()} className="DiscussionHero-participantAvatar" title={user.username?.()}>
                  <Avatar user={user} />
                </span>
              ))}
              {extra > 0 ? <span className="DiscussionHero-participantsMore">+{extra}</span> : null}
            </div>
          ) : null}
          <span className="DiscussionHero-metaItem">
            <i className="far fa-comment" aria-hidden="true" />
            {replies}{' '}
            {replies === 1
              ? trans('ramon-avocado.forum.discussion.post_singular', 'post')
              : trans('ramon-avocado.forum.discussion.post_plural', 'posts')}
          </span>
          {author ? (
            <span className="DiscussionHero-metaItem">
              <i className="far fa-user" aria-hidden="true" />
              {tr('show.opened_by', 'Opened by')} {author.displayName?.() || author.username?.()}
            </span>
          ) : null}
          {helpers?.formatDate ? (
            <span className="DiscussionHero-metaItem">
              <i className="far fa-clock" aria-hidden="true" />
              {helpers.formatDate(ticket.createdAt?.())}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Linha do tempo: respostas + mudanças de status ───────────────────────────
// O backend do tema grava cada troca de status (avocado_support_events) e a
// serve em `avocadoEvents` no ticket. Aqui elas entram entre as respostas, em
// ordem de data, no mesmo desenho dos event posts da discussão ("fulano fixou
// a discussão"), e um "7 meses depois" marca as pausas longas — a mesma regra
// de 4 dias do PostStream do core.

const TIME_GAP_MS = 1000 * 60 * 60 * 24 * 4;

/** Ícone por status, o mesmo dos filtros da extensão; boia quando não há. */
function statusIcon(status: string | null): string {
  const options = supportModule('forum/utils/status')?.FILTER_OPTIONS ?? [];
  const option = options.find((candidate: any) => candidate.id === status);

  return option?.icon ?? 'fas fa-life-ring';
}

function renderStatusEvent(event: any): Mithril.Children {
  const status = supportModule('forum/utils/status');
  const badge = status?.statusBadge ? status.statusBadge(event.toStatus) : event.toStatus;
  const name = event.displayName || event.username || '';
  const when = event.createdAt ? humanTime(new Date(event.createdAt)) : null;
  const href = event.username ? app.route('user', { username: event.username }) : null;

  return (
    <div className="AvocadoSupport-event" key={`event-${event.id}`}>
      <div className="AvocadoSupport-event-side">
        <i className={`${statusIcon(event.toStatus)} AvocadoSupport-event-icon`} aria-hidden="true" />
      </div>
      <div className="AvocadoSupport-event-info">
        {href ? (
          <a
            className="AvocadoSupport-event-user"
            href={href}
            onclick={(e: MouseEvent) => {
              e.preventDefault();
              m.route.set(href);
            }}
          >
            {name}
          </a>
        ) : (
          <span className="AvocadoSupport-event-user">{name}</span>
        )}{' '}
        {trans('ramon-avocado.forum.support.status_changed', 'marked the ticket as')} {badge} {when}
      </div>
    </div>
  );
}

function renderTimeGap(gapMs: number, key: string): Mithril.Children {
  return (
    <div className="PostStream-timeGap AvocadoSupport-timeGap" key={key}>
      <span>{app.translator.trans('core.forum.post_stream.time_lapsed_text', { period: dayjs().add(gapMs, 'ms').fromNow(true) })}</span>
    </div>
  );
}

/**
 * Recebe os vnodes das respostas que a extensão já montou e devolve a lista
 * com os eventos de status intercalados e as pausas marcadas. Cada vnode de
 * resposta carrega o modelo em `attrs.reply`, que dá a data.
 */
function buildTimeline(replyVnodes: any[], events: any[]): Mithril.Children[] {
  const entries: { at: number; vnode: Mithril.Children }[] = [];

  replyVnodes.forEach((vnode: any) => {
    const at = vnode?.attrs?.reply?.createdAt?.();

    entries.push({ at: at ? new Date(at).getTime() : 0, vnode });
  });

  events.forEach((event: any) => {
    if (!event || event.type !== 'status' || !event.toStatus) return;

    entries.push({ at: event.createdAt ? new Date(event.createdAt).getTime() : 0, vnode: renderStatusEvent(event) });
  });

  entries.sort((a, b) => a.at - b.at);

  const out: Mithril.Children[] = [];

  entries.forEach((entry, index) => {
    const previous = entries[index - 1];

    if (previous && entry.at && previous.at && entry.at - previous.at > TIME_GAP_MS) {
      out.push(renderTimeGap(entry.at - previous.at, `gap-${index}`));
    }

    out.push(entry.vnode);
  });

  return out;
}

/** Acha o `.LinkRobinsSupport-replies` dentro do que a página montou e o refaz. */
function weaveTimeline(root: any, events: any[]): void {
  const visit = (node: any): boolean => {
    if (!node || typeof node !== 'object') return false;

    if (Array.isArray(node)) return node.some(visit);

    if (String(node.attrs?.className ?? '').includes('LinkRobinsSupport-replies') && Array.isArray(node.children)) {
      node.children = buildTimeline(node.children.filter(Boolean), events);

      return true;
    }

    return Array.isArray(node.children) ? node.children.some(visit) : false;
  };

  visit(root);
}

/** A página atual é a de um ticket já carregado (a que ganha o hero)? */
export function isSupportTicketPage(className?: string | null): boolean {
  return !!className && className.includes(TICKET_PAGE_CLASS);
}

/**
 * Roda `apply` com um componente da extensão assim que ele existir.
 *
 * `reg.onLoad` chama de volta na hora quando o módulo já foi registrado e
 * guarda o callback quando não — ou seja, não depende da ordem em que os
 * bundles do tema e da extensão são avaliados.
 */
function onSupportComponent(name: string, apply: (component: any) => void): void {
  try {
    (flarum as any).reg.onLoad(EXTENSION_ID, `forum/components/${name}`, (module: any) => {
      const component = module?.default ?? module;

      if (component?.prototype) apply(component);
    });
  } catch (e) {
    // Sem registro não há o que remendar: a extensão segue com o spinner dela.
  }
}

/**
 * Remendos que precisam dos componentes da extensão: o botão que abre o
 * composer e os esqueletos de carregamento no lugar dos spinners dela.
 *
 * Cada remendo é guardado por uma checagem do método que ele envolve — são
 * pontos internos da extensão (`_renderList`, `_wrap`, o item `newTicket`), e
 * se uma versão futura renomear algum, o tema volta ao comportamento original
 * em vez de quebrar a página.
 */
export function installSupportCompat(): void {
  if (!supportEnabled()) return;

  // O botão "Novo ticket" abre o composer em vez de navegar para a página de
  // escolha de categoria. Se o composer não puder assumir, o clique segue para
  // o onclick da extensão e nada se perde.
  onSupportComponent('SupportIndexSidebar', (Sidebar) => {
    extend(Sidebar.prototype, 'items', function (items: any) {
      const button = items.has?.('newTicket') ? items.get('newTicket') : null;

      if (!button?.attrs) return;

      // As categorias entram no ar junto com a página, não no clique: assim o
      // composer abre com o chip pronto em vez de preenchê-lo na frente de quem
      // já está escrevendo.
      const api = supportModule('forum/utils/api');

      if (api?.loadCategories) loadTicketCategories(api);

      const navigate = button.attrs.onclick;

      button.attrs.onclick = (e: any) => {
        if (e && (e.metaKey || e.ctrlKey || e.shiftKey)) return;

        if (openNewTicketComposer()) {
          e?.preventDefault?.();
          return;
        }

        if (typeof navigate === 'function') navigate(e);
      };
    });
  });

  // Cada resposta ganha o avatar de quem escreveu, ao lado do nome: a extensão
  // mostra só nome e data, o que num fórum lê como uma lista de registros em vez
  // de uma conversa.
  onSupportComponent('ReplyItem', (Item) => {
    extend(Item.prototype, 'view', function (this: any, vdom: any) {
      const user = this.attrs?.reply?.user?.();

      if (!user || !Array.isArray(vdom?.children)) return;

      // O avatar vai numa coluna própria, irmã do cabeçalho — é o que permite
      // ao CSS montar a grade "avatar | cabeçalho + corpo" da discussão.
      vdom.children.unshift(
        <div className="AvocadoSupport-replySide">
          <Avatar user={user} className="AvocadoSupport-replyAvatar" />
        </div>
      );
      vdom.attrs.className = `${vdom.attrs.className ?? ''} AvocadoSupport-reply--withAvatar`;
    });
  });

  onSupportComponent('SupportIndexPage', (Page) => {
    if (typeof Page.prototype._renderList !== 'function') return;

    override(Page.prototype, '_renderList', function (this: any, original: any) {
      return this.loading ? renderSupportListSkeleton() : original();
    });
  });

  onSupportComponent('SupportShowPage', (Page) => {
    if (typeof Page.prototype._wrap !== 'function') return;

    override(Page.prototype, 'view', function (this: any, original: any) {
      if (this.loading) return this._wrap(<div className="LinkRobinsSupport-container">{renderSupportTicketSkeleton()}</div>);

      const vnode = original();

      // Com o ticket em mãos, a página ganha o hero da discussão. Ele entra
      // pelo slot `hero` do PageStructure; a classe avisa os overrides do tema
      // (index.tsx) para não tirarem esse hero nem repetirem o título.
      if (this.ticket && vnode?.attrs) {
        vnode.attrs.className = `${vnode.attrs.className ?? ''} ${TICKET_PAGE_CLASS}`;
        vnode.attrs.hero = () => renderTicketHero(this);

        const events = this.ticket.attribute?.('avocadoEvents');

        if (Array.isArray(events) && events.length) weaveTimeline(vnode.children, events);
      }

      return vnode;
    });
  });

  onSupportComponent('SupportComposePage', (Page) => {
    if (typeof Page.prototype._wrap !== 'function') return;

    // Aqui o que carrega são as categorias, então o esqueleto é o dos cartões
    // de categoria — o primeiro passo do formulário.
    override(Page.prototype, 'view', function (this: any, original: any) {
      if (!this.loading) return original();

      return this._wrap(<div className="LinkRobinsSupport-container">{renderSupportCategoriesSkeleton()}</div>);
    });
  });
}
