import app from 'flarum/forum/app';
import { truncate as coreTruncate } from 'flarum/common/utils/string';
import coreHighlight from 'flarum/common/helpers/highlight';
import escapeRegExp from 'flarum/common/utils/escapeRegExp';
import decodeCssEscapes from '../common/cssEscapes';
import abbreviateNumber from 'flarum/common/utils/abbreviateNumber';
import formatNumber from 'flarum/common/utils/formatNumber';

// ─── Translation helper ────────────────────────────────────────────────────────

export const trans = (key: string, fallback: string, params: Record<string, any> = {}): string => {
  // `extract: true` faz o trans devolver string em vez de NestedStringArray; sem
  // isso toda tradução cairia no fallback inglês.
  const out = app.translator?.trans(key, params, true);
  if (typeof out === 'string' && out !== key) return out;
  // Interpola {placeholders} no fallback, para não aparecer `{count}` cru.
  return Object.entries(params).reduce<string>((s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)), fallback);
};

// ─── Number guard ─────────────────────────────────────────────────────────────

/**
 * Relações para o `include` da API. As de tags (`tags`, `discussion.tags`…) só
 * existem com o flarum/tags ativo; pedir uma relação desconhecida derruba o
 * request inteiro com 400.
 */
export const apiInclude = (...relations: string[]): string =>
  relations.filter((relation) => 'flarum-tags' in flarum.extensions || !/(^|\.)tags$/.test(relation)).join(',');

export const numberOr = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// ─── View count (michaelbelgium/flarum-discussion-views) ─────────────────────

/**
 * Visualizações da discussão, ou null quando não há o que mostrar: a extensão
 * não está instalada (o atributo `viewCount` não vem) ou o ator não tem a
 * permissão de ver o número (`canViewNumber` false — a mesma condição que a
 * extensão usa para o contador dela na lista do core).
 */
export const discussionViews = (discussion: any): number | null => {
  const raw = discussion?.attribute?.('viewCount');
  if (raw === undefined || raw === null || discussion.attribute('canViewNumber') === false) return null;

  const count = Number(raw);
  return Number.isFinite(count) ? count : null;
};

/** Segue a opção "abreviar números" da extensão (1.2K em vez de 1.234). */
export const formatViews = (count: number): string =>
  Number(app.forum?.attribute('abbrNumber')) === 1 ? String(abbreviateNumber(count)) : formatNumber(count);

// ─── Color helpers ────────────────────────────────────────────────────────────

export const hexToRgba = (hex: string | null | undefined, alpha = 1): string => {
  if (!hex) return `rgba(63,136,246,${alpha})`;
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(63,136,246,${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export const hexLuminance = (hex: string | null | undefined): number => {
  if (!hex) return 0;
  const h = hex.replace('#', '');
  if (h.length !== 6) return 0;
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(parseInt(h.substring(0, 2), 16));
  const g = toLinear(parseInt(h.substring(2, 4), 16));
  const b = toLinear(parseInt(h.substring(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const iconColors = (hex: string | null | undefined, bgAlpha = 0.12): { bg: string; color: string } => ({
  bg: hexToRgba(hex, bgAlpha),
  color: hex || '#3f88f6',
});

// Garante contraste WCAG AA (4.5:1) contra branco.
const wcagDarkenForWhite = (hex: string): string => {
  if (!hex || hex.length < 6) return hex;
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  if (1.05 / (hexLuminance(hex) + 0.05) >= 4.5) return hex;
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  for (let i = 0; i < 12; i++) {
    r = Math.round(r * 0.78);
    g = Math.round(g * 0.78);
    b = Math.round(b * 0.78);
    const darkened = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
    if (1.05 / (hexLuminance(darkened) + 0.05) >= 4.5) return darkened;
  }
  return '#333333';
};

export const tagPillStyle = (hex: string | null | undefined, alpha = 0.1): Record<string, string> => {
  if (!hex) return {};
  const { bg } = iconColors(hex, alpha);
  const safeColor = wcagDarkenForWhite(hex);
  return { '--tag-bg': bg, '--tag-color': safeColor };
};

// ─── User display name ────────────────────────────────────────────────────────

export const displayName = (user: any): string => user?.displayName?.() || user?.username?.() || '';

// ─── Relative time label ──────────────────────────────────────────────────────
// Usa o humanTime do core, para seguir o idioma ativo e o resto do fórum.
import humanTime from 'flarum/common/utils/humanTime';

export const formatTimeLabel = (dateValue: Date | string | null | undefined): string => {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue as string);
  if (isNaN(date.getTime())) return '';
  return humanTime(date);
};

/** Idioma ativo do fórum ("pt-BR"), não o do navegador — senão a data não troca junto com o idioma. */
const forumLocale = (): string | undefined => {
  const value = (app as any).data?.locale;
  return typeof value === 'string' && value ? value.replace('_', '-') : undefined;
};

/** Data no idioma ativo do fórum (`Intl.DateTimeFormat`). */
export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  try {
    return new Intl.DateTimeFormat(forumLocale(), options).format(date);
  } catch {
    // Locale que o Intl não conhece: melhor a formatação padrão do navegador do que nenhuma.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
};

// ─── Text truncation ──────────────────────────────────────────────────────────

export const truncate = (str: string | null | undefined, max = 150): string => (str ? coreTruncate(str, max) : '');

// ─── Search highlight ─────────────────────────────────────────────────────────

// O core monta um RegExp com a frase: a busca vem da URL, então escapa como a
// lista de discussões do core faz (senão `?q=(` derruba a página).
export const highlight = (text: string, query: string, maxLength = 0): any =>
  text ? coreHighlight(text, query ? escapeRegExp(query) : undefined, maxLength || undefined) : '';

// ─── Discussion first-post excerpt ────────────────────────────────────────────

export const postPreview = (discussion: any, max = 150): string => {
  try {
    // `avocadoExcerpt` vem no payload da discussão (Api\DiscussionFields) e existe
    // já no primeiro paint, inclusive no boot, onde o Index manda só o linkage do
    // firstPost. O post do store é só fallback, para o texto não trocar quando o
    // post chega depois.
    const excerpt = (discussion.attribute?.('avocadoExcerpt') || '') as string;
    if (excerpt) return truncate(excerpt, max);

    const plain = discussion.firstPost?.()?.contentPlain?.() || '';
    if (plain) return truncate(plain, max);

    // Última linha: o excerpt que o flarum/sticky serializa nas fixadas.
    return truncate(discussion.attribute?.('firstPostExcerpt') || '', max);
  } catch {
    return '';
  }
};

// ─── Route helpers ────────────────────────────────────────────────────────────

export const safeRoute = (name: string, params: Record<string, any> = {}, fallback = '#'): string => {
  try {
    return app.route(name, params);
  } catch {
    return fallback;
  }
};

export const discussionRoute = (discussion: any, near?: number): string => {
  try {
    return app.route.discussion(discussion, near);
  } catch {
    return '#';
  }
};

export const tagRoute = (tag: any): string => {
  try {
    return app.route('tag', { tags: tag.slug() });
  } catch {
    return '#';
  }
};

// O parâmetro da rota se chama `username`, mas o valor é o slug do driver
// escolhido no admin (username por padrão, id no IdSlugDriver) — o mesmo que o
// core usa em app.route.user(). Montar o link com o username quebra o perfil
// quando o driver não é o padrão.
export const userSlug = (user: any): string => user?.slug?.() || user?.username?.() || '';

export const userRoute = (user: any): string => safeRoute('user', { username: userSlug(user) });

// ─── Path normalization (prevent traversal) ───────────────────────────────────

const normalizePath = (path: string): string =>
  String(path)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .split('/')
    .filter((seg, i) => {
      if (seg === '.' || seg === '') return i === 0;
      if (seg === '..') return false;
      return true;
    })
    .join('/');

// ─── Asset URL resolver ───────────────────────────────────────────────────────

export const resolveAssetUrl = (assetPath: string | null | undefined): string | null => {
  if (!assetPath) return null;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetPath)) return null;
  const normalized = normalizePath(assetPath);
  const base = app.forum?.attribute('assetsBaseUrl') || app.forum?.attribute('baseUrl');
  if (!base) return null;
  const suffix = app.forum?.attribute('assetsBaseUrl') ? '' : '/assets';
  return (base as string).replace(/\/+$/, '') + suffix + '/' + normalized;
};

export const safeCssUrl = (url: string | null | undefined): string => {
  if (!url) return 'none';
  const trimmed = String(url).trim();
  // Defesa em profundidade: só http(s), caminhos absolutos ou relativos
  // `./`/`../`; `data:`, `javascript:`, `file:` etc. são recusados.
  if (!/^(https?:\/\/|\/[^/]|\.\.?\/)/i.test(trimmed)) return 'none';
  const escaped = trimmed.replace(/[\\()'";]/g, '');
  return `url('${escaped}')`;
};

// O forumaker/profile-cover guarda o enquadramento vertical da capa (0–100%) e
// só o aplica no .UserCard do core; as superfícies do tema desenham a própria
// capa e precisam ler o valor. 50% é o padrão da extensão e o fallback sem ela.
export const coverPosition = (user: any): string => {
  const raw = Number(user?.cover_position?.() ?? user?.attribute?.('cover_position') ?? 50);
  // Number.isFinite, não truthiness: 0 é uma posição válida (topo).
  const pct = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 50;
  return `center ${pct}%`;
};

// ─── Admin-HTML sanitizer ─────────────────────────────────────────────────────
// Defesa em profundidade para o HTML colado pelo admin (hero, rodapé…): segue a
// convenção "admin == HTML" do Flarum, mas impede que uma conta de admin
// comprometida vire XSS para visitantes. Não é uma allowlist completa.
//
// <noscript>/<template> são reinterpretados em outro contexto de parser (vetor
// clássico de mXSS) e saem inteiros. <style> fica, porque o rodapé leva CSS de
// animação: o corpo é filtrado (SANITIZE_DANGER_CSS) e o nó só sai com um sink
// de injeção/exfiltração. <foreignObject> e as animações SMIL também saem: um
// <animate attributeName="href" values="javascript:…"> reescreve um link em
// runtime. Seletores de SVG diferenciam maiúsculas, daí o camelCase.
const SANITIZE_STRIP_ELS = [
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'noscript',
  'template',
  'foreignObject',
  'animate',
  'set',
  'animateMotion',
  'animateTransform',
];
const SANITIZE_URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'background', 'poster'];
const SANITIZE_DANGER_SCHEME = /^\s*(?:javascript|vbscript|data:text\/html)/i;
// O navegador ignora tab/newline em qualquer ponto da URL e corta controles no
// início: `java&#9;script:` roda como `javascript:`. Testa o esquema que ele vê.
const isDangerousUrl = (value: string): boolean => SANITIZE_DANGER_SCHEME.test(value.replace(/[\u0000-\u0020\u007F]+/g, ''));
const SANITIZE_DANGER_STYLE = /expression\s*\(|javascript:|vbscript:|@import/i;
// Sinks no corpo de <style>, que vira CSS para todo visitante: @import (fetch
// remoto = exfiltração e injeção), expression()/behavior/-moz-binding (execução
// de script legada), esquemas de script e payloads url(data:).
const SANITIZE_DANGER_CSS = /@import|expression\s*\(|behavior\s*:|-moz-binding|javascript\s*:|vbscript\s*:|url\(\s*["']?\s*data\s*:/i;
// Markup limpo converge depois da primeira passada; o teto impede que uma
// entrada patológica entre em loop.
const SANITIZE_MAX_PASSES = 5;

const sanitizeAdminHtmlOnce = (raw: string): string => {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(`<div id="__avs_root__">${raw}</div>`, 'text/html');
  } catch {
    return '';
  }
  const root = doc.getElementById('__avs_root__');
  if (!root) return '';

  // Comentários saem: comentários condicionais e `<!-- --><script>` são vetor de
  // mXSS e não têm conteúdo renderizado.
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => (c as ChildNode).remove());

  root.querySelectorAll(SANITIZE_STRIP_ELS.join(',')).forEach((el) => el.remove());

  // Folhas de estilo limpas ficam; as que levam um sink de CSS saem.
  root.querySelectorAll('style').forEach((el) => {
    const css = (el.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (SANITIZE_DANGER_CSS.test(decodeCssEscapes(css))) el.remove();
  });

  root.querySelectorAll('*').forEach((el) => {
    // Array.from em vez de spread: `NamedNodeMap` não tem Symbol.iterator em libs
    // antigas do TS. A cópia é necessária porque removeAttribute altera o mapa.
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if (SANITIZE_URL_ATTRS.includes(name) && isDangerousUrl(attr.value)) {
        el.removeAttribute(attr.name);
        return;
      }
      if (name === 'style' && SANITIZE_DANGER_STYLE.test(decodeCssEscapes(attr.value))) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return root.innerHTML;
};

export const sanitizeAdminHtml = (html: string | null | undefined): string => {
  let current = (html ?? '').toString().trim();
  if (!current) return '';

  // Defesa contra mXSS: repete a limpeza até a saída serializada parar de mudar,
  // pegando markup que só fica perigoso depois de um parse→serialize.
  for (let i = 0; i < SANITIZE_MAX_PASSES; i++) {
    const next = sanitizeAdminHtmlOnce(current);
    if (next === current) return next;
    current = next;
  }
  return current;
};

// ─── Safe CSS color ───────────────────────────────────────────────────────────
// Só hex `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` ou `rgb()/rgba()` numérico. O resto
// (ex.: cor de grupo editada para sair do style e injetar declarações) dá null e
// a declaração some. Espelha a allowlist `safeColor()` do PHP.
export const safeCssColor = (raw: string | null | undefined): string | null => {
  const v = (raw ?? '').toString().trim();
  if (!v) return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(?:0|1|0?\.\d+)\s*)?\)$/i.test(v)) return v;
  return null;
};

// ─── Clipboard helper ─────────────────────────────────────────────────────────

export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
};

// ─── Design constants ─────────────────────────────────────────────────────────

export const FALLBACK_COLORS: string[] = [''];

export const FALLBACK_ICONS: string[] = ['fas fa-tag', 'fa-regular fa-bookmark', 'fas fa-fire', 'fas fa-bolt'];

// ─── Navigation helper ────────────────────────────────────────────────────────

export const navigate = (e: Event, href: string): void => {
  e.preventDefault();
  m.route.set(href);
};

// ─── Featured tag IDs ─────────────────────────────────────────────────────────

const TAG_IDS_MAX_BYTES = 4096;

/** Lê um array JSON de ids de tag vindo do admin, com limite de tamanho. */
const parseTagIdSet = (raw: unknown): Set<string> => {
  if (typeof raw !== 'string' || raw.length === 0) return new Set();
  if (raw.length > TAG_IDS_MAX_BYTES) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((v) => String(v)));
  } catch {
    return new Set();
  }
};

export const getFeaturedTagIds = (): Set<string> => parseTagIdSet(app.forum?.attribute('avocadoFeaturedTags'));

// ─── Tags requiring hero image at creation ────────────────────────────────────
// Tags que pedem imagem do hero no compositor. Os produtos do changelog entram
// sozinhos: cada versão pode ter capa, e repetir as tags nos dois settings seria
// só mais uma chance de esquecer uma.
export const getHeroImageTagIds = (): Set<string> => {
  const ids = parseTagIdSet(app.forum?.attribute('avocadoHeroImageTags'));
  if (app.forum?.attribute('avocadoChangelogEnabled')) {
    parseTagIdSet(app.forum?.attribute('avocadoChangelogTags')).forEach((id) => ids.add(id));
  }
  return ids;
};

// ─── Changelog ────────────────────────────────────────────────────────────────
// Tags escolhidas como produto no admin (só com o changelog ligado). A versão e
// o tipo de capa só fazem sentido numa discussão que carregue uma delas.
export const getChangelogProductIds = (): Set<string> =>
  app.forum?.attribute('avocadoChangelogEnabled') ? parseTagIdSet(app.forum?.attribute('avocadoChangelogTags')) : new Set();

export const tagsAreChangelogProducts = (tags: any[] | null | undefined): boolean => {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  const products = getChangelogProductIds();
  return products.size > 0 && tags.some((t) => products.has(String(t?.id?.() ?? '')));
};

/** Espelha ChangelogFields::VERSION_PATTERN e o maxLength(32) do servidor. */
export const CHANGELOG_VERSION_MAX = 32;
export const CHANGELOG_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z .+_-]*$/;

/**
 * Atributos da discussão para os campos do changelog. Versão vazia ou inválida
 * fica de fora (o servidor recusaria); a capa colorida só vale sem imagem.
 * `cover` é o valor já codificado (ver utils/cover).
 */
export const changelogAttributes = (version: string, cover: string | null, hasImage: boolean): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const trimmed = version.trim();
  if (trimmed && trimmed.length <= CHANGELOG_VERSION_MAX && CHANGELOG_VERSION_PATTERN.test(trimmed)) attrs.changelogVersion = trimmed;
  if (cover && !hasImage) attrs.changelogCover = cover;
  return attrs;
};

// URL da imagem do hero da discussão, se houver.
export const getDiscussionHeroImageUrl = (discussion: any): string | null => {
  if (!discussion) return null;
  const url = discussion.attribute?.('heroImageUrl') || discussion.data?.attributes?.heroImageUrl || null;
  if (url) return String(url);
  const path = discussion.attribute?.('heroImagePath') || discussion.data?.attributes?.heroImagePath || null;
  return path ? resolveAssetUrl(String(path)) : null;
};

// Alguma das tags pede imagem do hero na criação?
export const tagsRequireHeroImage = (tags: any[] | null | undefined): boolean => {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  const wanted = getHeroImageTagIds();
  if (wanted.size === 0) return false;
  return tags.some((t) => wanted.has(String(t?.id?.() ?? '')));
};

// Envia uma imagem para /api/avocado/discussion-hero?discussionId=<id> e devolve
// o JSON do servidor (`{ heroImagePath, heroImageUrl }`) para atualizar o model.
export const uploadDiscussionHeroImage = async (
  discussionId: string | number,
  file: File
): Promise<{ heroImagePath: string; heroImageUrl: string | null }> => {
  const apiUrl = String(app.forum?.attribute('apiUrl') || '/api').replace(/\/+$/, '');
  const body = new FormData();
  body.append('avocado-discussion-hero', file);
  const resp: any = await app.request({
    method: 'POST',
    url: `${apiUrl}/avocado/discussion-hero?discussionId=${encodeURIComponent(String(discussionId))}`,
    serialize: (raw: any) => raw,
    body,
  });
  return {
    heroImagePath: resp?.heroImagePath ?? '',
    heroImageUrl: resp?.heroImageUrl ?? null,
  };
};

export const deleteDiscussionHeroImage = async (discussionId: string | number): Promise<void> => {
  const apiUrl = String(app.forum?.attribute('apiUrl') || '/api').replace(/\/+$/, '');
  await app.request({
    method: 'DELETE',
    url: `${apiUrl}/avocado/discussion-hero?discussionId=${encodeURIComponent(String(discussionId))}`,
  });
};

// Mesma checagem do backend (`can('rename', $discussion)`): os controles só
// aparecem para o autor e os moderadores.
export const canEditDiscussionHero = (discussion: any): boolean => {
  if (!discussion) return false;
  if (typeof discussion.canRename === 'function') {
    return !!discussion.canRename();
  }
  return !!discussion.attribute?.('canRename');
};

// ─── Skeleton cards — re-exported from the dedicated Skeletons module ─────────
export {
  renderThreadSkeleton,
  renderDiscSkeleton,
  renderProfileCardSkeleton,
  renderPostSkeleton,
  renderShowcaseSkeleton,
  renderDiscussionNavSkeleton,
} from './components/Skeletons';

// ─── Style helpers ────────────────────────────────────────────────────────────

export const categoryCardStyle = (hex: string | null | undefined, alpha = 0.12): Record<string, string> => {
  if (!hex) return {};
  const { bg, color } = iconColors(hex, alpha);
  return { '--cat-bg': bg, '--cat-color': color };
};

/**
 * Escapa um texto para caber numa custom property que o CSS usa em `content:`.
 * Serve para rótulos desenhados por pseudo-elemento (toolbar do flarum-messages),
 * onde o texto precisa vir traduzido do JS em vez de fixo no LESS.
 */
export const cssString = (value: string): string => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// ─── Load-more button ─────────────────────────────────────────────────────────

export const renderLoadMore = (label: string, onclick: () => void): any =>
  m('div', { className: 'AvocadoDiscussions-loadMore' }, [m('button', { className: 'Button AvocadoDiscussions-loadMoreBtn', onclick }, label)]);

// ─── Empty state ──────────────────────────────────────────────────────────────

export const renderEmpty = (label: string): any => m('div', { className: 'AvocadoDiscussions-empty' }, label);
