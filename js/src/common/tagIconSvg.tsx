import app from 'flarum/common/app';
import { override } from 'flarum/common/extend';
import Model from 'flarum/common/Model';
import Icon from 'flarum/common/components/Icon';
import classList from 'flarum/common/utils/classList';
import Tag from 'ext:flarum/tags/common/models/Tag';
import type Mithril from 'mithril';

/**
 * Ícone SVG nas tags — absorvido da extensão `ramon/tag-icon-svg`.
 *
 * Uma tag com SVG responde por `tag.icon()` com uma string de classe, no mesmo
 * formato de um ícone Font Awesome (`fas fa-bolt`):
 *
 *     TagIconSvg TagIconSvg--mono TagIconSvg-<hash>
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

const registry = new Map<string, string>();

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

function hash(input: string): string {
  let h = 5381;

  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }

  return (h >>> 0).toString(36) + input.length.toString(36);
}

function injectStyle(key: string, svg: string): void {
  if (typeof document === 'undefined') return;

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const dataUri = 'data:image/svg+xml,' + encodeURIComponent(svg);

  style.appendChild(document.createTextNode(`.${ICON_PREFIX}-${key}{--tag-icon-svg:url("${dataUri}")}\n`));
}

/** Registra um SVG e devolve a string de classe que o renderiza. */
export function svgIconName(svg: string, mono = true): string {
  const key = hash(svg);

  if (!registry.has(key)) {
    registry.set(key, svg);
    injectStyle(key, svg);
  }

  return classList(ICON_PREFIX, mono ? `${ICON_PREFIX}--mono` : `${ICON_PREFIX}--color`, `${ICON_PREFIX}-${key}`);
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

  // O markup já passou por SvgIconSanitizer no servidor (única entrada é a API
  // de tags) — mesma garantia do `bioHtml`/post renderizado que trustedHtml documenta.
  return (
    <i aria-hidden="true" {...rest} className={classList('icon', name, className)}>
      {m.trust(svg)}
    </i>
  );
}

export function tagIconSvg(tag: Tag): string | null {
  return Model.attribute<string | null>('iconSvg').call(tag) || null;
}

export function tagIconSvgMono(tag: Tag): boolean {
  return Model.attribute<boolean | null>('iconSvgMono').call(tag) !== false;
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

  /** A classe Font Awesome guardada, mesmo quando um SVG a substitui. */
  proto.fontAwesomeIcon = function (this: Tag) {
    return Model.attribute<string | null>('icon').call(this);
  };

  override(Tag.prototype, 'icon', function (original) {
    const svg = tagIconSvgActive() ? tagIconSvg(this) : null;

    return svg ? svgIconName(svg, tagIconSvgMono(this)) : original();
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
