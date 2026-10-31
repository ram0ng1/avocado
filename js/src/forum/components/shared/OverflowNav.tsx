import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import Dropdown from 'flarum/common/components/Dropdown';
import extractText from 'flarum/common/utils/extractText';
import type Mithril from 'mithril';
import { trans } from '../../utils';

export interface OverflowNavAttrs extends ComponentAttrs {
  /** LinkButtons de um ItemList. */
  items: Mithril.Children[];
  navLabel?: string;
}

/** Folga para um arredondamento de subpixel não empurrar uma pílula para fora. */
const SAFETY = 4;

/** Espera antes de fechar o menu aberto por hover, para dar tempo de cruzar o vão. */
const HOVER_CLOSE_DELAY = 180;

/**
 * Nav de pílulas numa linha só: com muitas extensões, os itens do IndexSidebar
 * não cabem no cabeçalho. Mede cada pílula uma vez, mostra as que cabem e põe o
 * resto num dropdown "Mais". O primeiro paint é a medição (`is-measuring`).
 */
export default class OverflowNav extends Component<OverflowNavAttrs> {
  private widths: number[] = [];
  private moreWidth = 0;
  private gap = 6;
  /** Quantos itens ficam visíveis; -1 enquanto a medição está pendente. */
  private visible = -1;

  private navEl: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private onWindowResize: (() => void) | null = null;

  /** Menu "mais" aberto: define a direção da seta. */
  private moreOpen = false;
  private hoverCloseTimer: number | null = null;

  view(vnode: Mithril.Vnode<OverflowNavAttrs, this>) {
    const items = this.attrs.items || [];

    // Os itens mudam depois do boot (login, extensão que registra tarde).
    if (this.widths.length && this.widths.length !== items.length) this.reset();

    const measuring = this.visible < 0;
    const inlineCount = measuring ? items.length : Math.min(this.visible, items.length);
    const overflow = items.slice(inlineCount);

    return (
      <div className={`AvocadoHome-sectionHead-nav${measuring ? ' is-measuring' : ''}`}>
        <nav className="AvocadoHomeNav AvocadoHomeNav--inline" aria-label={this.attrs.navLabel}>
          {items.slice(0, inlineCount)}
          {(measuring || overflow.length > 0) && (
            <Dropdown
              className={`AvocadoHomeNav-more${this.moreOpen ? ' is-open' : ''}`}
              buttonClassName="Button"
              menuClassName="Dropdown-menu--right"
              icon="fas fa-ellipsis"
              caretIcon={this.moreOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
              label={trans('ramon-avocado.forum.home.nav_more', 'More')}
              accessibleToggleLabel={extractText(app.translator.trans('ramon-avocado.forum.home.nav_more_label'))}
            >
              {measuring ? [] : overflow}
            </Dropdown>
          )}
        </nav>
      </div>
    );
  }

  oncreate(vnode: Mithril.VnodeDOM<OverflowNavAttrs, this>) {
    super.oncreate(vnode);

    this.navEl = (vnode.dom as HTMLElement).querySelector('.AvocadoHomeNav');
    this.settle();

    const container = vnode.dom as HTMLElement;
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.onResize());
      this.ro.observe(container);
    } else {
      this.onWindowResize = () => this.onResize();
      window.addEventListener('resize', this.onWindowResize, { passive: true });
    }

    this.bindMoreMenu(container);

    // A largura das pílulas muda quando a webfont carrega: mede de novo.
    (document as any).fonts?.ready?.then(() => {
      this.reset();
      m.redraw();
    });
  }

  /**
   * Abre o menu "mais" no hover (só ponteiro; toque continua no clique) e mantém
   * `moreOpen` em sincronia com o Bootstrap. Delegado no wrapper porque o dropdown
   * é recriado conforme cabem mais ou menos pílulas.
   */
  private bindMoreMenu(container: HTMLElement) {
    const $container = $(container);

    $container.on('shown.bs.dropdown', () => {
      this.clearHoverTimer();
      this.moreOpen = true;
      m.redraw();
    });

    $container.on('hidden.bs.dropdown', () => {
      this.clearHoverTimer();
      this.moreOpen = false;
      m.redraw();
    });

    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;

    $container.on('mouseenter', '.AvocadoHomeNav-more', () => {
      this.clearHoverTimer();
      if (!this.moreOpen) this.toggleMoreMenu();
    });

    $container.on('mouseleave', '.AvocadoHomeNav-more', () => {
      this.clearHoverTimer();
      this.hoverCloseTimer = window.setTimeout(() => {
        if (this.moreOpen) this.toggleMoreMenu();
      }, HOVER_CLOSE_DELAY);
    });
  }

  private toggleMoreMenu() {
    const toggle = this.element?.querySelector('.AvocadoHomeNav-more .Dropdown-toggle') as HTMLElement | null;
    if (!toggle) return;

    // @ts-ignore — Bootstrap's jQuery plugin has no bundled types.
    $(toggle).dropdown('toggle');

    // O Bootstrap foca o toggle, e o foco por script pinta o anel :focus-visible.
    // Só o hover chega aqui; clique e teclado mantêm o anel.
    toggle.blur();
  }

  private clearHoverTimer() {
    if (this.hoverCloseTimer !== null) {
      clearTimeout(this.hoverCloseTimer);
      this.hoverCloseTimer = null;
    }
  }

  onupdate() {
    // Medição agendada pelo view() (primeiro paint, ou os itens mudaram).
    if (this.visible < 0) this.settle();
  }

  onremove(vnode: Mithril.VnodeDOM<OverflowNavAttrs, this>) {
    this.ro?.disconnect();
    if (this.onWindowResize) window.removeEventListener('resize', this.onWindowResize);
    this.clearHoverTimer();
    $(vnode.dom).off('shown.bs.dropdown hidden.bs.dropdown mouseenter mouseleave');
    this.navEl = null;
  }

  private onResize() {
    // Nunca medido (montado no celular, onde o nav é display:none): o layout mudou,
    // tenta de novo.
    if (!this.widths.length) {
      this.reset();
      m.redraw();
      return;
    }

    if (this.fit()) m.redraw();
  }

  private reset() {
    this.widths = [];
    this.moreWidth = 0;
    this.visible = -1;
  }

  /** Lê as pílulas desenhadas, calcula a divisão e sai do estado de medição. */
  private settle() {
    if (!this.measure()) {
      // Sem medida (sem DOM, ou nav escondido no celular): mostra tudo, e o onResize()
      // recomeça quando o nav voltar ao layout.
      this.visible = Number.MAX_SAFE_INTEGER;
      m.redraw();
      return;
    }

    this.fit();
    // `visible` precisa terminar >= 0, ou o próximo onupdate recalcularia para sempre.
    if (this.visible < 0) this.visible = this.widths.length;
    m.redraw();
  }

  /** Lê a largura de cada pílula no DOM; false quando não há o que ler. */
  private measure(): boolean {
    const nav = this.navEl;
    if (!nav || !nav.getClientRects().length) return false;

    const widths: number[] = [];
    for (const child of Array.from(nav.children) as HTMLElement[]) {
      const width = Math.ceil(child.getBoundingClientRect().width);
      if (child.classList.contains('AvocadoHomeNav-more')) this.moreWidth = width;
      else widths.push(width);
    }
    this.widths = widths;

    const gap = parseFloat(getComputedStyle(nav).columnGap);
    if (!isNaN(gap)) this.gap = gap;

    return widths.length > 0;
  }

  /** Recalcula quantas pílulas cabem; true quando o número mudou. */
  private fit(): boolean {
    const nav = this.navEl;
    if (!nav || !this.widths.length) return false;

    // O nav é `flex: 1 1 0`: a largura é o que o título deixou e não depende de
    // quantas pílulas desenhamos, o que mantém o cálculo estável.
    const available = nav.clientWidth - SAFETY;
    const natural = this.widths.reduce((sum, w) => sum + w, 0) + this.gap * (this.widths.length - 1);

    let next = this.widths.length;

    if (natural > available) {
      let used = this.moreWidth;
      next = 0;
      for (const width of this.widths) {
        used += width + this.gap;
        if (used > available) break;
        next++;
      }
    }

    if (next === this.visible) return false;
    this.visible = next;
    return true;
  }
}
