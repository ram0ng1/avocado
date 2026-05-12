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
  const trimmed = String(url).trim();
  // Defense-in-depth: only http(s), absolute paths, or `./...`/`../...` relatives.
  // `data:`, `javascript:`, `file:` etc. are rejected even though current callers
  // only feed admin-validated URLs.
  if (!/^(https?:\/\/|\/[^/]|\.\.?\/)/i.test(trimmed)) return 'none';
  const escaped = trimmed.replace(/[\\()'";]/g, '');
  return `url('${escaped}')`;
};

// ─── Admin-HTML sanitizer ─────────────────────────────────────────────────────
// Defense-in-depth scrub for admin-pasted HTML (custom hero, footer, …) before
// it lands in `m.trust()` / `innerHTML`. Removes <script>, <iframe>, etc.; strips
// on*=, javascript:/vbscript:/data:text/html in href/src; neutralizes inline
// styles using expression()/@import. Not a full allow-list — relies on the
// "admin == HTML" Flarum convention but ensures admin-account compromise does
// not become guest-visible XSS.
const SANITIZE_STRIP_ELS = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'];
const SANITIZE_URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'background', 'poster'];
const SANITIZE_DANGER_SCHEME = /^\s*(?:javascript|vbscript|data:text\/html)/i;
const SANITIZE_DANGER_STYLE = /expression\s*\(|javascript:|vbscript:|@import/i;

export const sanitizeAdminHtml = (html: string | null | undefined): string => {
  const raw = (html ?? '').toString().trim();
  if (!raw) return '';
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(
      `<div id="__avs_root__">${raw}</div>`,
      'text/html',
    );
  } catch {
    return '';
  }
  const root = doc.getElementById('__avs_root__');
  if (!root) return '';

  root.querySelectorAll(SANITIZE_STRIP_ELS.join(',')).forEach((el) => el.remove());

  root.querySelectorAll('*').forEach((el) => {
    // Array.from instead of spread — `NamedNodeMap` lacks Symbol.iterator under
    // older TS lib targets. Snapshot is needed because removeAttribute mutates.
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if (SANITIZE_URL_ATTRS.includes(name) && SANITIZE_DANGER_SCHEME.test(attr.value)) {
        el.removeAttribute(attr.name);
        return;
      }
      if (name === 'style' && SANITIZE_DANGER_STYLE.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return root.innerHTML;
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

const TAG_IDS_MAX_BYTES = 4096;

/** Parse an admin-controlled JSON array of tag-id strings, with size cap. */
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

export const getFeaturedTagIds = (): Set<string> =>
  parseTagIdSet(app.forum?.attribute('avocadoFeaturedTags'));

// ─── Tags requiring hero image at creation ────────────────────────────────────
// Set of tag IDs the admin marked as "asks for a hero image" — when one of
// these tags is selected in the composer, the user gets an upload field for
// the discussion's hero image.
export const getHeroImageTagIds = (): Set<string> =>
  parseTagIdSet(app.forum?.attribute('avocadoHeroImageTags'));

// Resolve the hero image URL stored on a discussion (if any).
export const getDiscussionHeroImageUrl = (discussion: any): string | null => {
  if (!discussion) return null;
  const url =
    discussion.attribute?.('heroImageUrl') ||
    discussion.data?.attributes?.heroImageUrl ||
    null;
  if (url) return String(url);
  const path =
    discussion.attribute?.('heroImagePath') ||
    discussion.data?.attributes?.heroImagePath ||
    null;
  return path ? resolveAssetUrl(String(path)) : null;
};

// True when at least one of the given tags is configured (in admin) to ask
// for a hero image when a discussion is being created with that tag.
export const tagsRequireHeroImage = (tags: any[] | null | undefined): boolean => {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  const wanted = getHeroImageTagIds();
  if (wanted.size === 0) return false;
  return tags.some((t) => wanted.has(String(t?.id?.() ?? '')));
};

// POST a single image file to /api/avocado/discussion-hero?discussionId=<id>.
// Resolves with the JSON body returned by the server (`{ heroImagePath, heroImageUrl }`)
// so callers can update the discussion model in-place.
export const uploadDiscussionHeroImage = async (
  discussionId: string | number,
  file: File,
): Promise<{ heroImagePath: string; heroImageUrl: string | null }> => {
  const apiUrl = (app.forum?.attribute('apiUrl') || '/api').replace(/\/+$/, '');
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
    heroImageUrl:  resp?.heroImageUrl  ?? null,
  };
};

// DELETE the discussion's hero image. Resolves once the server clears it.
export const deleteDiscussionHeroImage = async (
  discussionId: string | number,
): Promise<void> => {
  const apiUrl = (app.forum?.attribute('apiUrl') || '/api').replace(/\/+$/, '');
  await app.request({
    method: 'DELETE',
    url: `${apiUrl}/avocado/discussion-hero?discussionId=${encodeURIComponent(String(discussionId))}`,
  });
};

// True when the actor is allowed to set/remove the hero image of a discussion.
// Mirrors the backend permission check (`can('rename', $discussion)`), so the
// controls only appear for the OP and moderators.
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
