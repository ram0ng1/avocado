/**
 * Shared utilities for ramon/avocado forum components.
 */
import app from 'flarum/forum/app';
import { truncate as coreTruncate } from 'flarum/common/utils/string';
import coreHighlight from 'flarum/common/helpers/highlight';

// ─── Translation helper ────────────────────────────────────────────────────────

export const trans = (key: string, fallback: string, params: Record<string, any> = {}): string => {
  const out = app.translator?.trans(key, params);
  // `trans()` may return Mithril children (array) or a string. Only treat
  // primitive string output as a successful translation; anything else falls
  // back to the literal we passed in.
  if (typeof out === 'string' && out !== key) return out;
  // Interpolate {placeholders} into the fallback when the translation key is missing,
  // so callers don't see literal `{count}` in the UI.
  return Object.entries(params).reduce<string>(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    fallback
  );
};

// ─── Number guard ─────────────────────────────────────────────────────────────

export const numberOr = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

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

// Ensures a hex color meets WCAG AA (4.5:1) contrast ratio against white.
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

export const displayName = (user: any): string =>
  user?.displayName?.() || user?.username?.() || '';

// ─── Relative time label ──────────────────────────────────────────────────────
// Delegates to Flarum's core humanTime helper so the output follows the
// active locale (e.g. "há 5 minutos" in pt-BR, "5 minutes ago" in en, etc.)
// and matches the rest of the forum's time formatting.
import humanTime from 'flarum/common/utils/humanTime';

export const formatTimeLabel = (dateValue: Date | string | null | undefined): string => {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue as string);
  if (isNaN(date.getTime())) return '';
  return humanTime(date);
};

// ─── Text truncation ──────────────────────────────────────────────────────────

export const truncate = (str: string | null | undefined, max = 150): string =>
  str ? coreTruncate(str, max) : '';

// ─── Search highlight ─────────────────────────────────────────────────────────

export const highlight = (text: string, query: string, maxLength = 0): any =>
  text ? coreHighlight(text, query || undefined, maxLength || undefined) : '';

// ─── Discussion first-post excerpt ────────────────────────────────────────────

export const postPreview = (discussion: any, max = 150): string => {
  try {
    const plain = discussion.firstPost?.()?.contentPlain?.() || '';
    if (plain) return truncate(plain, max);
    return truncate(discussion.attribute?.('firstPostContent') || '', max);
  } catch {
    return '';
  }
};

// ─── Route helpers ────────────────────────────────────────────────────────────

export const safeRoute = (name: string, params: Record<string, any> = {}, fallback = '#'): string => {
  try { return app.route(name, params); } catch { return fallback; }
};

export const discussionRoute = (discussion: any, near?: number): string => {
  try { return app.route.discussion(discussion, near); } catch { return '#'; }
};

export const tagRoute = (tag: any): string => {
  try { return app.route('tag', { tags: tag.slug() }); } catch { return '#'; }
};

export const userRoute = (user: any): string =>
  safeRoute('user', { username: user?.username?.() || '' });

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
  const escaped = String(url).replace(/[\\()'";]/g, '');
  return `url('${escaped}')`;
};

// ─── Clipboard helper ─────────────────────────────────────────────────────────

export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
};

// ─── Design constants ─────────────────────────────────────────────────────────

export const FALLBACK_COLORS: string[] = [''];

export const FALLBACK_ICONS: string[] = [
  'fas fa-tag', 'fa-regular fa-bookmark',
  'fas fa-fire', 'fas fa-bolt',
];

// ─── Navigation helper ────────────────────────────────────────────────────────

export const navigate = (e: Event, href: string): void => {
  e.preventDefault();
  m.route.set(href);
};

// ─── Featured tag IDs ─────────────────────────────────────────────────────────

export const getFeaturedTagIds = (): Set<string> => {
  try {
    const raw = app.forum?.attribute('avocadoFeaturedTags');
    return new Set(((raw ? JSON.parse(raw as string) : []) as string[]).map(String));
  } catch {
    return new Set();
  }
};

// ─── Skeleton cards — re-exported from the dedicated Skeletons module ─────────
export {
  renderThreadSkeleton,
  renderDiscSkeleton,
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

// ─── Load-more button ─────────────────────────────────────────────────────────

export const renderLoadMore = (label: string, onclick: () => void): any =>
  m('div', { className: 'AvocadoDiscussions-loadMore' }, [
    m('button', { className: 'Button AvocadoDiscussions-loadMoreBtn', onclick }, label),
  ]);

// ─── Empty state ──────────────────────────────────────────────────────────────

export const renderEmpty = (label: string): any =>
  m('div', { className: 'AvocadoDiscussions-empty' }, label);
