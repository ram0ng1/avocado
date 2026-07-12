import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import Dropdown from 'flarum/common/components/Dropdown';
import extractText from 'flarum/common/utils/extractText';
import type Mithril from 'mithril';
import { trans } from '../../utils';

export interface OverflowNavAttrs extends ComponentAttrs {
  /** Nav items (LinkButton vnodes from an ItemList). */
  items: Mithril.Children[];
  /** aria-label for the <nav> landmark. */
  navLabel?: string;
}

/** Extra slack kept free so a sub-pixel rounding error can't push a pill out. */
const SAFETY = 4;

/** Grace period before a hover-opened menu closes, so crossing the gap is forgiving. */
const HOVER_CLOSE_DELAY = 180;

/**
 * OverflowNav — a single-row pill nav that never overflows its header.
 *
 * Forums with many extensions (user directory, private conversations, polls…)
 * push more items into IndexSidebar's nav than the section header can hold. We
 * measure each pill once, then render only the ones that fit in the space left
 * over by the heading and collapse the rest into a "More" dropdown.
 *
 * The first paint is a measuring pass: every item is rendered inline (hidden via
 * `is-measuring`) so the DOM can be read, after which a redraw settles the split.
 */
export default class OverflowNav extends Component<OverflowNavAttrs> {
  /** Measured width of each item, by index. Empty until the measuring pass runs. */
  private widths: number[] = [];
  private moreWidth = 0;
  private gap = 6;
  /** How many items are shown inline; -1 while a measuring pass is pending. */
  private visible = -1;

  private navEl: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private onWindowResize: (() => void) | null = null;

  /** Whether the "more" menu is open — drives the caret direction. */
  private moreOpen = false;
  private hoverCloseTimer: number | null = null;

  view(vnode: Mithril.Vnode<OverflowNavAttrs, this>) {
    const items = this.attrs.items || [];

    // The item set can change after boot (login, late-registering extension).
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

    // Pill widths shift once the webfont swaps in — re-measure from scratch.
    (document as any).fonts?.ready?.then(() => {
      this.reset();
      m.redraw();
    });
  }

  /**
   * Open the "more" menu on hover (pointer devices only — touch still taps) and
   * keep `moreOpen` in sync with Bootstrap so the caret can point the right way.
   *
   * Bound on the wrapper with delegation, because the dropdown itself is created
   * and destroyed as the viewport changes how many pills fit.
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

    // Bootstrap focuses the toggle, and a script-driven focus makes the browser
    // paint its :focus-visible ring — an outline nobody asked for by hovering.
    // Only the hover path reaches this, so click/keyboard keep their focus ring.
    toggle.blur();
  }

  private clearHoverTimer() {
    if (this.hoverCloseTimer !== null) {
      clearTimeout(this.hoverCloseTimer);
      this.hoverCloseTimer = null;
    }
  }

  onupdate() {
    // A measuring pass was queued by view() (first paint, or the item set changed).
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
    // Never measured successfully (mounted on a phone, where the nav is
    // display:none) — the layout just changed, so try again.
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

  /** Read the rendered pills, work out the split, and repaint out of the measuring state. */
  private settle() {
    if (!this.measure()) {
      // Not measurable (no DOM, or the nav is hidden on phone). Render everything,
      // as before; onResize() starts a fresh pass once the nav is laid out again.
      this.visible = Number.MAX_SAFE_INTEGER;
      m.redraw();
      return;
    }

    this.fit();
    // `visible` must end up >= 0 or the next onupdate would settle again, forever.
    if (this.visible < 0) this.visible = this.widths.length;
    m.redraw();
  }

  /** Read every pill's width off the DOM. Returns false when there's nothing to read. */
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

  /** Recompute how many pills fit. Returns true when the count changed. */
  private fit(): boolean {
    const nav = this.navEl;
    if (!nav || !this.widths.length) return false;

    // The nav is `flex: 1 1 0`, so its width is the space the heading left over —
    // it does not depend on how many pills we render, which keeps this stable.
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
