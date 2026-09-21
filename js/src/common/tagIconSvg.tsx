import app from 'flarum/common/app';
import { override } from 'flarum/common/extend';
import Model from 'flarum/common/Model';
import Icon from 'flarum/common/components/Icon';
import classList from 'flarum/common/utils/classList';
import Tag from 'ext:flarum/tags/common/models/Tag';
import type Mithril from 'mithril';
import sanitizeSvgIcon from './svgIconSanitizer';
import trustedHtml from './trustedHtml';

/**
 * Ícone SVG nas tags — absorvido da extensão `ramon/tag-icon-svg`.
 *
 * Uma tag com SVG responde por `tag.icon()` com uma string de classe, no mesmo
 * formato de um ícone Font Awesome (`fas fa-bolt`):
 *
 *     TagIconSvg TagIconSvg--mono TagIconSvg-<hash> [TagIconSvg--s150]
 *
 * (`--s150` = tamanho de 150%; só aparece quando a tag pede algo diferente de 100%.)
 *
 * Duas coisas a renderizam:
 *  - o componente Icon do core (usado pelo `tagIcon` do flarum/tags, `Button
 *    icon=`, …) é sobrescrito para embutir o markup do SVG;
 *  - código que escreve a string direto num atributo de classe
 *    (`<i className={tag.icon()} />`) recebe um elemento vazio, pintado por uma
 *    stylesheet injetada em runtime como máscara CSS (monocromático) ou imagem
 *    de fundo (colorido).
 *
 * Nada disso vale sem o switch (`avocado.tag_icon_svg_enabled`) — ver
 * `tagIconSvgActive`. Com a extensão avulsa ativa o servidor nem serializa o
 * flag e o tema não instala nada.
 */
export const ICON_PREFIX = 'TagIconSvg';

const STYLE_ID = 'TagIconSvg-styles';

const SETTING_KEY = 'avocado.tag_icon_svg_enabled';

/** Tamanho do ícone em % do glifo — espelha TagIconSvg::SCALE_* no servidor. */
export const ICON_SCALE_MIN = 50;
export const ICON_SCALE_MAX = 250;
export const ICON_SCALE_DEFAULT = 100;

/** Hash do SVG recebido → markup JÁ sanitizado (null = não é um SVG utilizável). */
const registry = new Map<string, string | null>();

/** Tamanhos que já têm regra na stylesheet injetada. */
const scales = new Set<number>();

/**
 * No forum o veredito vem do servidor (`avocadoTagIconSvg` já considera switch,
 * extensão avulsa e colunas). No admin não há esse flag atualizado — o
 * attribute do forum só muda no próximo boot —, então o switch é lido ao vivo
 * dos settings e o resto é deduzido das extensões instaladas.
 */
export function tagIconSvgActive(): boolean {
  const settings = (app as any).data?.settings;

  if (settings) {
    const extensions = ((window as any).flarum?.extensions ?? {}) as Record<string, unknown>;
    const on = [true, 1, '1', 'true'].includes(settings[SETTING_KEY]);

    return on && 'flarum-tags' in extensions && !('ramon-tag-icon-svg' in extensions);
  }

  return !!(app as any).forum?.attribute('avocadoTagIconSvg');
}

/**
 * O tamanho tem coluna própria, de uma migration posterior à do SVG. Enquanto ela
 * não existe o servidor não aceita `iconSvgScale`, e o modal não deve oferecê-lo.
 */
export function tagIconSvgScalable(): boolean {
  return !!(app as any).forum?.attribute('avocadoTagIconSvgScale');
}

/** Qualquer coisa → um tamanho válido (inteiro, dentro da faixa; lixo vira 100). */
export function clampIconScale(value: unknown): number {
  const n = Math.round(Number(value));

  if (!Number.isFinite(n) || n <= 0) return ICON_SCALE_DEFAULT;

  return Math.min(ICON_SCALE_MAX, Math.max(ICON_SCALE_MIN, n));
}

function hash(input: string): string {
  let h = 5381;

  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }

  return (h >>> 0).toString(36) + input.length.toString(36);
}

function injectRule(rule: string): void {
  if (typeof document === 'undefined') return;

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.appendChild(document.createTextNode(rule + '\n'));
}

function injectStyle(key: string, svg: string): void {
  const dataUri = 'data:image/svg+xml,' + encodeURIComponent(svg);

  injectRule(`.${ICON_PREFIX}-${key}{--tag-icon-svg:url("${dataUri}")}`);
}

/**
 * A classe do tamanho, ou null em 100%. Dois hifens de propósito: `svgIconVnode`
 * acha o hash do SVG por `TagIconSvg-<alfanumérico>`, e `--s150` não casa com isso.
 */
function scaleClass(scale: number): string | null {
  if (scale === ICON_SCALE_DEFAULT) return null;

  if (!scales.has(scale)) {
    scales.add(scale);
    injectRule(`.${ICON_PREFIX}--s${scale}{--tag-icon-scale:${scale / 100}}`);
  }

  return `${ICON_PREFIX}--s${scale}`;
}

/**
 * Registra um SVG e devolve a string de classe que o renderiza — ou null quando
 * ele não sobrevive à sanitização (quem chama cai no ícone Font Awesome).
 *
 * É AQUI que o markup é sanitizado no navegador, uma vez por SVG: tudo o que o
 * tema embute sai deste registro, venha da API (já limpo pelo servidor) ou do
 * arquivo que o admin acabou de escolher no modal (ainda cru). Ver svgIconSanitizer.
 *
 * `scale` é o tamanho em % do glifo (ver TagIconSvg.less: só o desenho cresce, a
 * caixa continua 1em).
 */
export function svgIconName(svg: string, mono = true, scale: number = ICON_SCALE_DEFAULT): string | null {
  const key = hash(svg);

  if (!registry.has(key)) {
    const clean = sanitizeSvgIcon(svg);

    registry.set(key, clean);
    if (clean) injectStyle(key, clean);
  }

  if (!registry.get(key)) return null;

  return classList(ICON_PREFIX, mono ? `${ICON_PREFIX}--mono` : `${ICON_PREFIX}--color`, `${ICON_PREFIX}-${key}`, scaleClass(clampIconScale(scale)));
}

export function isSvgIconName(name: unknown): name is string {
  return typeof name === 'string' && name.startsWith(ICON_PREFIX + ' ');
}

/** O SVG inline para um nome produzido por `svgIconName`, ou null se desconhecido. */
export function svgIconVnode(name: string, attrs: Record<string, any> = {}): Mithril.Children | null {
  const match = new RegExp(`\\b${ICON_PREFIX}-([a-z0-9]+)\\b`).exec(name);
  const svg = match && registry.get(match[1]);

  if (!svg) return null;

  const { className, ...rest } = attrs;

  // Só sai do registro markup que passou por sanitizeSvgIcon (espelho do
  // SvgIconSanitizer do servidor) — ver svgIconName.
  return (
    <i aria-hidden="true" {...rest} className={classList('icon', name, className)}>
      {trustedHtml(svg)}
    </i>
  );
}

export function tagIconSvg(tag: Tag): string | null {
  return Model.attribute<string | null>('iconSvg').call(tag) || null;
}

export function tagIconSvgMono(tag: Tag): boolean {
  return Model.attribute<boolean | null>('iconSvgMono').call(tag) !== false;
}

/** 100 quando o servidor não manda o atributo (coluna ainda não migrada). */
export function tagIconSvgScale(tag: Tag): number {
  return clampIconScale(Model.attribute<number | null>('iconSvgScale').call(tag));
}

let installed = false;

/** Idempotente: forum e admin chamam no boot, e os overrides só agem com o switch ligado. */
export function installTagIconSvg(): void {
  if (installed) return;
  installed = true;

  const proto = Tag.prototype as any;

  proto.iconSvg = function (this: Tag) {
    return tagIconSvgActive() ? tagIconSvg(this) : null;
  };

  proto.iconSvgMono = function (this: Tag) {
    return tagIconSvgMono(this);
  };

  proto.iconSvgScale = function (this: Tag) {
    return tagIconSvgScale(this);
  };

  /** A classe Font Awesome guardada, mesmo quando um SVG a substitui. */
  proto.fontAwesomeIcon = function (this: Tag) {
    return Model.attribute<string | null>('icon').call(this);
  };

  override(Tag.prototype, 'icon', function (original) {
    const svg = tagIconSvgActive() ? tagIconSvg(this) : null;

    return (svg && svgIconName(svg, tagIconSvgMono(this), tagIconSvgScale(this))) || original();
  });

  override(Icon.prototype, 'view', function (original, vnode) {
    const { name, noStyleOverride, ...attrs } = vnode.attrs;

    if (isSvgIconName(name)) {
      const rendered = svgIconVnode(name, attrs);

      if (rendered) return rendered;
    }

    return original(vnode);
  });
}
