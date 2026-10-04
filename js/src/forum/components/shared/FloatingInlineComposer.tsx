import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import InlineComposer from './InlineComposer';
import type { IInlineComposerAttrs } from './InlineComposer';
import InlineComposerState from '../../states/InlineComposerState';
import { trans } from '../../utils';

/** Onde o cartão fica: na base da tela, ou no lugar do campo que o abriu. */
export type ComposerPlacement = 'floating' | 'inline';

/**
 * Modo do admin (`avocado.new_discussion_composer`): 'default' é o de antes
 * (InlineComposer aberto no lugar do campo, sem este componente).
 */
export const composerPlacement = (): 'default' | ComposerPlacement => {
  const mode = app.forum?.attribute<string>('avocadoNewDiscussionComposer');
  return mode === 'default' || mode === 'inline' ? mode : 'floating';
};

export interface IFloatingInlineComposerAttrs extends IInlineComposerAttrs {
  /** O campo "Tell everyone…" que abriu o cartão: ponto de partida e de volta. */
  alignTo: string;
  placement: ComposerPlacement;
}

/** Voo do campo até a base (e de volta). */
const MORPH_MS = 520;
/** O campo fechando o espaço que deixou na página. */
const COLLAPSE_MS = 380;
/** O miolo do cartão só aparece quando ele está quase pousado. */
const CONTENT_DELAY_MS = 260;

/** Sobe, passa um tico do ponto e assenta — o "pouso" do cartão. */
const EASE_LAND = 'cubic-bezier(0.2, 1.12, 0.32, 1)';
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** Altura do editor escolhida na alça, lembrada entre visitas (como a do core). */
const HEIGHT_KEY = 'avocado.inlineComposerHeight';
const MIN_EDITOR = 80;
/** Quanto puxar a alça abaixo do mínimo para o cartão virar bolha. */
const MINIMIZE_PULL = 64;

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Aparência de um elemento no ponto de partida/chegada de uma metamorfose. */
type Look = { radius: string; bg: string; shadow: string };

const lookOf = (el: HTMLElement): Look => {
  const cs = getComputedStyle(el);
  return { radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, shadow: cs.boxShadow };
};

/** O campo desenha o contorno com `border`; no cartão ele vira um anel de box-shadow. */
const triggerLook = (el: HTMLElement): Look => {
  const cs = getComputedStyle(el);
  return { radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, shadow: `0 0 0 1px ${cs.borderTopColor}` };
};

/** Caixa do campo aberto, lida do DOM — o ponto de partida/chegada do recolhimento. */
const openBox = (el: HTMLElement): Keyframe => {
  const cs = getComputedStyle(el);
  return {
    height: `${el.offsetHeight}px`,
    marginBottom: cs.marginBottom,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    borderTopWidth: cs.borderTopWidth,
    borderBottomWidth: cs.borderBottomWidth,
    opacity: 1,
    filter: 'blur(0)',
    transform: 'none',
  };
};

/** O mesmo campo recolhido (espelha `.AvocadoHome-postInput.is-away`). */
const closedBox: Keyframe = {
  height: '0px',
  marginBottom: '0px',
  paddingTop: '0px',
  paddingBottom: '0px',
  borderTopWidth: '0px',
  borderBottomWidth: '0px',
  opacity: 0,
  filter: 'blur(8px)',
  transform: 'scale(0.97)',
};

/**
 * O InlineComposer da home e de /discussions como cartão flutuante na base da
 * tela, como o compositor de resposta na discussão (Composer.less), mas com o
 * compositor próprio do tema (título, tags, imagem do hero, campos do changelog).
 *
 * A entrada é uma metamorfose (FLIP): o campo "Tell everyone…" se desprende da
 * página, voa até a base e vira o cartão — tamanho, cantos e cor de fundo
 * interpolados de um para o outro — enquanto o espaço que ele ocupava se fecha
 * com um desfoque. O miolo do compositor aparece no pouso. Fechar faz o
 * caminho inverso: o cartão volta e vira o campo de novo.
 *
 * A alça no topo muda a altura do editor, como a do compositor do core. Puxada
 * para baixo além do mínimo, o cartão estica e, ao soltar, vira uma bolha na
 * base (a mesma da "Escreva uma resposta…" da discussão) com o título já
 * digitado; clicar nela traz o cartão de volta. O estado do compositor fica
 * aqui, não no InlineComposer, para nada se perder enquanto ele é bolha.
 *
 * Tudo com a Web Animations API, sem estado de animação no Mithril: o estado
 * final fica em CSS (`.AvocadoHome-postInput.is-away`, o cartão, a bolha), e
 * as animações só cobrem o trajeto entre um e outro.
 *
 * Com `placement: 'inline'` o cartão nasce no lugar do campo, no topo da
 * página: a mesma metamorfose, só que sem sair de cima — e sem alça nem bolha,
 * que só fazem sentido no cartão da base.
 */
export default class FloatingInlineComposer extends Component<IFloatingInlineComposerAttrs> {
  private composerState!: InlineComposerState;
  private minimized = false;
  private fullScreen = false;
  private editorHeight: number | null = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.composerState = this.attrs.state ?? new InlineComposerState();
    try {
      const saved = parseInt(localStorage.getItem(HEIGHT_KEY) || '', 10);
      if (saved >= MIN_EDITOR) this.editorHeight = saved;
    } catch {
      /* armazenamento bloqueado: fica a altura padrão */
    }
  }

  private trigger(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.attrs.alignTo);
  }

  private card(): HTMLElement | null {
    return (this.element as HTMLElement | undefined)?.querySelector<HTMLElement>('.AvocadoHome-composer') ?? null;
  }

  private bubble(): HTMLElement | null {
    return (this.element as HTMLElement | undefined)?.querySelector<HTMLElement>('.AvocadoComposerDock-bubble') ?? null;
  }

  private applyHeight(h: number): void {
    this.editorHeight = h;
    (this.element as HTMLElement | undefined)?.style.setProperty('--avocado-dock-editor-h', `${Math.round(h)}px`);
  }

  /** Alinha o cartão à coluna do campo (ele continua no DOM, só recolhido). */
  private get floating(): boolean {
    return this.attrs.placement === 'floating';
  }

  private syncColumn = (): void => {
    const dock = this.element as HTMLElement | undefined;
    const rect = this.trigger()?.getBoundingClientRect();
    if (!dock || !this.floating) return;

    if (!rect || rect.width === 0) {
      dock.style.removeProperty('--avocado-dock-left');
      dock.style.removeProperty('--avocado-dock-width');
      return;
    }

    dock.style.setProperty('--avocado-dock-left', `${Math.round(rect.left)}px`);
    dock.style.setProperty('--avocado-dock-width', `${Math.round(rect.width)}px`);
  };

  oncreate(vnode: any) {
    super.oncreate(vnode);
    this.syncColumn();
    window.addEventListener('resize', this.syncColumn, { passive: true });
    if (this.floating && this.editorHeight) this.applyHeight(this.editorHeight);

    const trigger = this.trigger();
    const card = this.card();
    if (!trigger || !card) return;

    // O editor monta a barra de ferramentas num redraw depois deste: medido
    // agora, o cartão sairia menor e daria um pulo no fim da animação, com a
    // barra surgindo de repente. Até ela existir o cartão fica montado,
    // invisível e sem ocupar espaço (`is-preparing`), e o campo segue no lugar.
    const dock = this.element as HTMLElement;
    dock.classList.add('is-preparing');
    this.whenEditorReady(card).then(() => {
      if (!dock.isConnected) return;
      dock.classList.remove('is-preparing');
      this.enter(trigger, card);
      card.querySelector<HTMLInputElement>('.AvocadoHome-composerTitle')?.focus();
    });
  }

  /** Resolve quando a barra do editor tem altura de barra (ou desiste em ~10 quadros). */
  private whenEditorReady(card: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      let frames = 0;
      const check = () => {
        const bar = card.querySelector<HTMLElement>('ul.TextEditor-controls');
        if ((bar && bar.offsetHeight >= 30) || ++frames > 10) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  private enter(trigger: HTMLElement, card: HTMLElement): void {
    if (!this.floating) {
      this.growInPlace(trigger, card);
      return;
    }

    // "First": o campo ainda inteiro, antes de recolher.
    const from = trigger.getBoundingClientRect();
    const fromLook = triggerLook(trigger);
    const box = openBox(trigger);

    trigger.classList.add('is-away');
    if (reducedMotion()) return;

    // O espaço do campo se fecha, com o campo se desfazendo no lugar.
    trigger.animate(
      [
        { ...box, visibility: 'visible' },
        { opacity: 0, offset: 0.55 },
        { ...closedBox, visibility: 'visible' },
      ],
      { duration: COLLAPSE_MS, easing: EASE_OUT }
    );

    this.morph(card, from, fromLook, 'in');
    this.element
      .querySelector('.AvocadoComposerDock-handle')
      ?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: CONTENT_DELAY_MS, fill: 'backwards' });
  }

  onupdate(vnode: any) {
    super.onupdate(vnode);
    this.syncColumn();
  }

  onbeforeremove(vnode: any) {
    super.onbeforeremove(vnode);
    const trigger = this.trigger();
    // Fechado como bolha, quem volta para o campo é a bolha.
    const el = this.minimized ? this.bubble() : this.card();

    if (!trigger || !el || reducedMotion()) {
      trigger?.classList.remove('is-away');
      return;
    }

    if (!this.floating) return this.shrinkInPlace(trigger, el);

    // "Last" da volta: o campo inteiro de novo. Abre já, com a animação
    // cobrindo o trajeto, para o cartão mirar no lugar onde ele vai estar.
    trigger.classList.remove('is-away');
    const to = trigger.getBoundingClientRect();
    const toLook = triggerLook(trigger);

    trigger.animate([closedBox, { opacity: 0, offset: 0.6 }, openBox(trigger)], { duration: MORPH_MS, easing: EASE_OUT });

    return this.morph(el, to, toLook, 'out').finished.then(() => undefined);
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    window.removeEventListener('resize', this.syncColumn);
    document.documentElement.classList.remove('avocado-composer-fullscreen');
  }

  // ── No lugar do campo ───────────────────────────────────────────────────────
  // Aqui o cartão ocupa o espaço do campo na página, então a metamorfose é da
  // altura de verdade (não um transform): o campo cresce até virar o cartão e
  // a página desce junto, sem pulo. A cor, a borda e os cantos passam de um
  // para o outro, e o miolo entra em cascata como no flutuante.

  private growInPlace(trigger: HTMLElement, card: HTMLElement): void {
    const look = triggerLook(trigger);
    const fromHeight = trigger.offsetHeight;
    const fromGap = getComputedStyle(trigger).marginBottom;

    trigger.classList.add('is-away');
    if (reducedMotion()) return;

    const dock = this.element as HTMLElement;
    const own = getComputedStyle(card);
    const toGap = getComputedStyle(dock).marginBottom;

    card.style.overflow = 'hidden';
    dock.animate([{ marginBottom: fromGap }, { marginBottom: toGap }], { duration: MORPH_MS, easing: EASE_OUT });
    card
      .animate(
        [
          { height: `${fromHeight}px`, backgroundColor: look.bg, borderColor: getComputedStyle(trigger).borderTopColor, borderRadius: look.radius },
          {
            height: `${card.offsetHeight}px`,
            backgroundColor: own.backgroundColor,
            borderColor: own.borderTopColor,
            borderRadius: own.borderTopLeftRadius,
          },
        ],
        { duration: MORPH_MS, easing: EASE_LAND }
      )
      .finished.then(() => card.style.removeProperty('overflow'));
    this.cascadeIn(card);
  }

  private shrinkInPlace(trigger: HTMLElement, card: HTMLElement): Promise<void> {
    const dock = this.element as HTMLElement;
    const own = getComputedStyle(card);

    // O campo aberto, medido escondido: é o tamanho em que o cartão termina.
    trigger.classList.remove('is-away');
    const look = triggerLook(trigger);
    const toHeight = trigger.offsetHeight;
    const toGap = getComputedStyle(trigger).marginBottom;
    const toBorder = getComputedStyle(trigger).borderTopColor;
    trigger.classList.add('is-away');

    card.style.overflow = 'hidden';
    Array.from(card.children).forEach((child) =>
      child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: EASE_OUT, fill: 'forwards' })
    );
    dock.animate([{ marginBottom: getComputedStyle(dock).marginBottom }, { marginBottom: toGap }], {
      duration: MORPH_MS,
      easing: EASE_OUT,
      fill: 'forwards',
    });

    return card
      .animate(
        [
          {
            height: `${card.offsetHeight}px`,
            backgroundColor: own.backgroundColor,
            borderColor: own.borderTopColor,
            borderRadius: own.borderTopLeftRadius,
          },
          { height: `${toHeight}px`, backgroundColor: look.bg, borderColor: toBorder, borderRadius: look.radius },
        ],
        { duration: MORPH_MS, easing: EASE_OUT, fill: 'forwards' }
      )
      .finished.then(() => {
        // O cartão já tem o tamanho e a cara do campo: a troca é invisível, e o
        // conteúdo do campo reaparece por cima.
        trigger.classList.remove('is-away');
        trigger.firstElementChild?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
      });
  }

  /** O miolo do cartão entrando em cascata, quando ele está quase pronto. */
  private cascadeIn(card: HTMLElement): void {
    Array.from(card.children).forEach((child, i) =>
      child.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 240, delay: CONTENT_DELAY_MS + i * 40, easing: EASE_OUT, fill: 'backwards' }
      )
    );
  }

  /**
   * Leva o elemento do retângulo `rect` até o lugar dele (`in`) ou o inverso
   * (`out`). Escala com origem no canto, e os cantos compensados pela escala
   * para não achatarem no caminho.
   */
  private morph(el: HTMLElement, rect: DOMRect, look: Look, direction: 'in' | 'out'): Animation {
    const home = el.getBoundingClientRect();
    const sx = rect.width / home.width;
    const sy = rect.height / home.height;
    const radius = parseFloat(look.radius) || 0;
    const own = getComputedStyle(el);

    const asOther: Keyframe = {
      transformOrigin: 'top left',
      transform: `translate(${rect.left - home.left}px, ${rect.top - home.top}px) scale(${sx}, ${sy})`,
      borderRadius: `${radius / sx}px / ${radius / sy}px`,
      backgroundColor: look.bg,
      boxShadow: look.shadow,
    };
    const asSelf: Keyframe = {
      transformOrigin: 'top left',
      transform: 'none',
      borderRadius: own.borderTopLeftRadius,
      backgroundColor: own.backgroundColor,
      boxShadow: own.boxShadow,
    };

    // O miolo: some logo na volta, aparece em cascata no pouso na ida.
    Array.from(el.children).forEach((child, i) => {
      if (direction === 'in') {
        child.animate(
          [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 240, delay: CONTENT_DELAY_MS + i * 40, easing: EASE_OUT, fill: 'backwards' }
        );
      } else {
        child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: EASE_OUT, fill: 'forwards' });
      }
    });

    return el.animate(direction === 'in' ? [asOther, asSelf] : [asSelf, asOther], {
      duration: MORPH_MS,
      easing: direction === 'in' ? EASE_LAND : EASE_OUT,
      fill: direction === 'in' ? 'none' : 'forwards',
    });
  }

  // ── Alça: altura e bolha ────────────────────────────────────────────────────

  private onHandleDown = (e: PointerEvent): void => {
    (e as any).redraw = false;
    if (e.button !== 0) return;

    const dock = this.element as HTMLElement;
    const card = this.card();
    // Em prévia o editor some e quem tem a altura é a área da prévia.
    const editor = card?.querySelector<HTMLElement>(this.composerState.preview ? '.AvocadoHome-composerPreviewArea' : '.TextEditor-editor');
    if (!card || !editor) return;
    e.preventDefault();

    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);

    const startY = e.clientY;
    const startH = editor.getBoundingClientRect().height;
    // Tudo no cartão que não é o editor; o editor cresce até o cartão chegar perto do topo.
    const chrome = card.getBoundingClientRect().height - startH;
    const maxH = Math.max(MIN_EDITOR, window.innerHeight - chrome - 96);
    let pull = 0;

    dock.classList.add('is-resizing');

    const move = (ev: PointerEvent) => {
      const want = startH + (startY - ev.clientY);
      this.applyHeight(Math.min(maxH, Math.max(MIN_EDITOR, want)));
      // Abaixo do mínimo o cartão estica para baixo, avisando que vai virar bolha.
      pull = Math.max(0, MIN_EDITOR - want);
      card.style.transform = pull ? `translateY(${pull * 0.6}px) scale(${1 - Math.min(pull, 160) / 1600})` : '';
      dock.classList.toggle('will-minimize', pull >= MINIMIZE_PULL);
    };

    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      dock.classList.remove('is-resizing', 'will-minimize');

      // O cartão como está na tela (esticado), ponto de partida da bolha.
      const stretched = card.style.transform;
      const from = card.getBoundingClientRect();
      card.style.transform = '';

      // Virando bolha, o puxão não conta como nova altura: o cartão volta como estava.
      if (pull >= MINIMIZE_PULL) this.applyHeight(startH);

      try {
        if (this.editorHeight) localStorage.setItem(HEIGHT_KEY, String(Math.round(this.editorHeight)));
      } catch {
        /* armazenamento bloqueado */
      }

      if (pull >= MINIMIZE_PULL) this.minimize(from);
      else if (stretched) card.animate([{ transform: stretched }, { transform: 'none' }], { duration: 280, easing: EASE_LAND });
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  /** Cartão → bolha, com um "pop" elástico no pouso. */
  private minimize(from: DOMRect): void {
    const card = this.card();
    const look = card ? lookOf(card) : null;

    this.minimized = true;
    m.redraw.sync();

    const bubble = this.bubble();
    if (!bubble || !look || reducedMotion()) return;

    this.morph(bubble, from, look, 'in').finished.then(() => {
      bubble.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.03, 0.9)', offset: 0.3 },
          { transform: 'scale(0.99, 1.05)', offset: 0.6 },
          { transform: 'scale(1)' },
        ],
        { duration: 420, easing: 'ease-out' }
      );
    });
  }

  /**
   * Tela cheia, como a do compositor do core: o cartão ocupa a tela; a prévia
   * começa desligada e, ligada pelo botão, fica ao lado do editor. A troca é
   * a mesma metamorfose (do tamanho de antes para o novo).
   */
  private toggleFullScreen(): void {
    const card = this.card();
    const from = card?.getBoundingClientRect();
    const look = card ? lookOf(card) : null;

    this.fullScreen = !this.fullScreen;
    // Entra com a prévia desligada; o botão de prévia a abre ao lado do editor.
    this.composerState.fullScreen = this.fullScreen;
    this.composerState.preview = false;
    document.documentElement.classList.toggle('avocado-composer-fullscreen', this.fullScreen);
    m.redraw.sync();

    const focusBody = () => this.card()?.querySelector<HTMLElement>('.TextEditor-editor')?.focus();
    if (!card || !from || !look || reducedMotion()) {
      focusBody();
      return;
    }
    this.morph(card, from, look, 'in').finished.then(focusBody);
  }

  /** Minimizar a partir do botão: a mesma bolha do puxão na alça. */
  private minimizeFromControl(): void {
    if (this.fullScreen) this.toggleFullScreen();
    const card = this.card();
    if (card) this.minimize(card.getBoundingClientRect());
  }

  /** Os controles do canto, como os do compositor do core (`.Composer-controls`). */
  private controls() {
    const t = (key: string, fallback: string) => {
      const out = app.translator.trans(key);
      return out && String(out) !== key ? out : fallback;
    };
    const button = (key: string, icon: string, label: any, onclick: () => void) =>
      m(
        `li.item-${key}`,
        m(
          'button.Button.Button--icon.Button--link.hasIcon',
          { type: 'button', 'aria-label': label, title: label, onclick },
          m('i.icon.Button-icon', { 'aria-hidden': 'true', className: icon })
        )
      );

    return m('ul.AvocadoComposerDock-controls', [
      this.floating && button('minimize', 'fas fa-minus', t('core.forum.composer.minimize_tooltip', 'Minimize'), () => this.minimizeFromControl()),
      button(
        'fullScreen',
        this.fullScreen ? 'fas fa-compress' : 'fas fa-expand',
        this.fullScreen
          ? t('core.forum.composer.exit_full_screen_tooltip', 'Exit Full Screen')
          : t('core.forum.composer.full_screen_tooltip', 'Full Screen'),
        () => this.toggleFullScreen()
      ),
      button('close', 'fas fa-times', t('core.forum.composer.close_tooltip', 'Close'), () => this.attrs.onClose()),
    ]);
  }

  /** Bolha → cartão, pela mesma metamorfose da entrada. */
  private restore(): void {
    const bubble = this.bubble();
    const from = bubble?.getBoundingClientRect();
    const look = bubble ? lookOf(bubble) : null;

    this.minimized = false;
    m.redraw.sync();

    const card = this.card();
    const focusTitle = () => card?.querySelector<HTMLInputElement>('.AvocadoHome-composerTitle')?.focus();
    if (!card || !from || !look || reducedMotion()) {
      focusTitle();
      return;
    }

    this.morph(card, from, look, 'in').finished.then(focusTitle);
  }

  view() {
    const { alignTo, placement, state, ...composerAttrs } = this.attrs;
    const title = this.composerState.title.trim();
    const user = app.session.user;

    return (
      <div
        className={`AvocadoComposerDock AvocadoComposerDock--${this.attrs.placement}${this.minimized ? ' is-minimized' : ''}${
          this.fullScreen ? ' is-fullscreen' : ''
        }`}
      >
        {!this.minimized && this.controls()}
        {this.floating && !this.fullScreen && (
          <div
            className="AvocadoComposerDock-handle"
            role="separator"
            aria-orientation="horizontal"
            title={trans('ramon-avocado.forum.composer.resize_handle', 'Drag to resize · pull down to minimize')}
            onpointerdown={this.onHandleDown}
          />
        )}
        <InlineComposer {...composerAttrs} state={this.composerState} />
        {this.minimized && (
          <button type="button" className="AvocadoReplyDock AvocadoComposerDock-bubble" onclick={() => this.restore()}>
            {user && <Avatar user={user} className="AvocadoReplyDock-avatar" />}
            <span className="AvocadoReplyDock-label">
              {title || trans('ramon-avocado.forum.home.start_discussion', 'Tell everyone what are you working on...')}
            </span>
            <i className="fas fa-chevron-up AvocadoComposerDock-bubbleIcon" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }
}
