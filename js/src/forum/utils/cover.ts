/**
 * A capa "colorida" de uma versão do changelog — o banner para quem não envia
 * imagem. O valor guardado em `changelogCover` diz de onde vêm as cores:
 *
 *   null                → sem capa colorida
 *   'color'             → automática: a cor do produto até a cor do 1º tipo
 *   'tags:12,15'        → as cores das tags escolhidas, na ordem (uma ou várias)
 *   'preset:sunset'     → uma predefinição de cores
 *
 * Guardar os IDs das tags (e não as cores) mantém a capa acompanhando a tag se
 * o admin trocar a cor dela depois. O formato é validado no servidor
 * (Api\ChangelogFields) com a mesma lista de predefinições.
 */
import app from 'flarum/forum/app';
import { safeCssColor } from '../utils';
import { changelogProductIds } from './changelog';

export interface CoverPreset {
  key: string;
  a: string;
  b: string;
}

/** Espelha ChangelogEntry::COVER_PRESETS no servidor. */
export const COVER_PRESETS: CoverPreset[] = [
  { key: 'sunset', a: '#f97316', b: '#ec4899' },
  { key: 'ocean', a: '#0ea5e9', b: '#6366f1' },
  { key: 'forest', a: '#16a34a', b: '#0d9488' },
  { key: 'violet', a: '#7c3aed', b: '#db2777' },
  { key: 'ember', a: '#ef4444', b: '#f59e0b' },
  { key: 'slate', a: '#475569', b: '#0f172a' },
];

export type CoverMode = 'off' | 'color' | 'tags' | 'preset';

export interface ParsedCover {
  mode: CoverMode;
  /** Chave da predefinição, no modo `preset`. */
  preset: string | null;
  /** IDs das tags, no modo `tags`. */
  tagIds: string[];
}

export const parseCover = (value: string | null | undefined): ParsedCover => {
  const raw = (value ?? '').trim();
  if (raw === 'color') return { mode: 'color', preset: null, tagIds: [] };

  if (raw.startsWith('preset:')) {
    const key = raw.slice('preset:'.length);
    if (COVER_PRESETS.some((p) => p.key === key)) return { mode: 'preset', preset: key, tagIds: [] };
  }

  if (raw.startsWith('tags:')) {
    const ids = raw
      .slice('tags:'.length)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id));
    if (ids.length) return { mode: 'tags', preset: null, tagIds: ids };
  }

  return { mode: 'off', preset: null, tagIds: [] };
};

export const encodeCover = (cover: Partial<ParsedCover> & { mode: CoverMode }): string | null => {
  switch (cover.mode) {
    case 'color':
      return 'color';
    case 'preset':
      return cover.preset ? `preset:${cover.preset}` : null;
    case 'tags':
      return cover.tagIds?.length ? `tags:${cover.tagIds.join(',')}` : 'color';
    default:
      return null;
  }
};

/** Degradê CSS a partir de uma lista de cores; uma só vira um degradê do escuro ao claro dela mesma. */
export const coverGradient = (colors: string[]): string | null => {
  if (!colors.length) return null;

  if (colors.length === 1) {
    return `linear-gradient(135deg, color-mix(in srgb, ${colors[0]} 78%, #000), color-mix(in srgb, ${colors[0]} 55%, #fff))`;
  }

  const stops = colors.map((color, i) => (i === 0 ? `color-mix(in srgb, ${color} 82%, #000)` : color));
  return `linear-gradient(135deg, ${stops.join(', ')})`;
};

export interface ResolvedCover {
  /** Cores do degradê, já validadas. Vazio = deixa o CSS usar a cor primária. */
  colors: string[];
  /** Ícone (classe FA ou SVG da tag) para o desenho gigante e apagado do banner. */
  icon: string | null;
  gradient: string | null;
}

const byPosition = (a: any, b: any): number => (a.position?.() ?? 9999) - (b.position?.() ?? 9999);

/**
 * Cores e ícone de uma capa, dadas as tags da discussão (ou as escolhidas no
 * compositor). Devolve null quando não há capa colorida.
 */
export const resolveCover = (value: string | null | undefined, tags: any[]): ResolvedCover | null => {
  const cover = parseCover(value);
  if (cover.mode === 'off') return null;

  const list = (tags || []).filter(Boolean);
  const productIds = new Set(changelogProductIds());
  const product = list.find((t) => productIds.has(String(t.id?.()))) ?? null;
  const types = product ? list.filter((t) => String(t.parent?.()?.id?.() ?? '') === String(product.id())).sort(byPosition) : [];
  const color = (tag: any): string | null => safeCssColor(tag?.color?.());
  const iconOf = (tag: any): string | null => tag?.icon?.() || null;
  const defaultIcon = iconOf(types[0]) || iconOf(product);

  if (cover.mode === 'preset') {
    const preset = COVER_PRESETS.find((p) => p.key === cover.preset)!;
    const colors = [preset.a, preset.b];
    return { colors, icon: defaultIcon, gradient: coverGradient(colors) };
  }

  if (cover.mode === 'tags') {
    const chosen = cover.tagIds.map((id) => list.find((t) => String(t.id?.()) === id) ?? app.store.getById('tags', id)).filter(Boolean);
    const colors = chosen.map(color).filter((c): c is string => !!c);
    return { colors, icon: chosen.map(iconOf).find(Boolean) ?? defaultIcon, gradient: coverGradient(colors) };
  }

  // 'color': do produto até a cor do primeiro tipo.
  const colors = [color(product), color(types[0])].filter((c): c is string => !!c);
  return { colors, icon: defaultIcon, gradient: coverGradient(colors) };
};
