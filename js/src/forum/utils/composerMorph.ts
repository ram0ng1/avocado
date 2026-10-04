import app from 'flarum/forum/app';
import { override } from 'flarum/common/extend';

/**
 * Tela cheia do compositor do core com metamorfose (opção do admin
 * `avocado.composer_morph`) — o mesmo efeito da tela cheia do compositor da
 * home (FloatingInlineComposer): o cartão cresce do tamanho em que estava até
 * ocupar a tela, com o miolo entrando em cascata, e o inverso ao sair.
 *
 * O core troca de posição só com classe (a tela cheia aparece de uma vez). O
 * "antes" é lido no instante do clique — embrulhando fullScreen/exitFullScreen
 * do app.composer, antes do redraw — e o "depois" quando o Composer reage à
 * nova posição (animatePositionChange). Abrir, fechar e minimizar seguem do core.
 *
 * Fora no celular (o core já abre o compositor em tela cheia) e com "reduzir
 * movimento".
 */

const MORPH_MS = 460;
const CONTENT_DELAY_MS = 200;
const EASE_LAND = 'cubic-bezier(0.2, 1.12, 0.32, 1)';
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const enabled = (): boolean =>
  !!app.forum?.attribute('avocadoComposerMorph') &&
  app.screen() !== 'phone' &&
  !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

type Snapshot = { rect: DOMRect; radius: string; bg: string; shadow: string };

const snapshot = (el: Element): Snapshot => {
  const cs = getComputedStyle(el);
  return { rect: el.getBoundingClientRect(), radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, shadow: cs.boxShadow };
};

/** O compositor como estava no clique; consumido pela troca de posição seguinte. */
let before: Snapshot | null = null;

/** Do retângulo de antes até o lugar atual, com cantos compensados pela escala. */
function morphFrom(el: HTMLElement, from: Snapshot): void {
  const home = el.getBoundingClientRect();
  if (!home.width || !home.height) return;

  const sx = from.rect.width / home.width;
  const sy = from.rect.height / home.height;
  const radius = parseFloat(from.radius) || 0;
  const own = getComputedStyle(el);

  el.animate(
    [
      {
        transformOrigin: 'top left',
        transform: `translate(${from.rect.left - home.left}px, ${from.rect.top - home.top}px) scale(${sx}, ${sy})`,
        borderRadius: `${radius / sx}px / ${radius / sy}px`,
        backgroundColor: from.bg,
        boxShadow: from.shadow,
      },
      {
        transformOrigin: 'top left',
        transform: 'none',
        borderRadius: own.borderTopLeftRadius,
        backgroundColor: own.backgroundColor,
        boxShadow: own.boxShadow,
      },
    ],
    { duration: MORPH_MS, easing: EASE_LAND }
  );

  Array.from(el.children).forEach((child, i) =>
    child.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 220, delay: CONTENT_DELAY_MS + i * 40, easing: EASE_OUT, fill: 'backwards' }
    )
  );
}

export default function installComposerMorph(): void {
  const composer = app.composer as any;

  (['fullScreen', 'exitFullScreen'] as const).forEach((name) => {
    const original = composer[name];
    if (typeof original !== 'function') return;

    composer[name] = function (this: any, ...args: unknown[]) {
      const el = document.querySelector('.App-composer .Composer');
      before = enabled() && el ? snapshot(el) : null;
      return original.apply(this, args);
    };
  });

  override('flarum/forum/components/Composer', 'animatePositionChange', function (this: any, original: () => unknown) {
    const prev = this.prevPosition;
    const next = this.state.position;
    const result = original();

    const from = before;
    before = null;
    const toggledFullScreen = prev !== next && (prev === 'fullScreen' || next === 'fullScreen');
    if (from && toggledFullScreen && enabled() && this.element) morphFrom(this.element as HTMLElement, from);

    return result;
  });
}
