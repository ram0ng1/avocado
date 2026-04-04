/**
 * Shared utilities for ramon/avocado forum components.
 * Centralises functions that were previously duplicated across
 * index.js, HomePage.js, AllDiscussionsPage.js, TagPage.js and UserProfilePage.js.
 */
import app from 'flarum/forum/app';
import { truncate as coreTruncate } from 'flarum/common/utils/string';
import coreHighlight from 'flarum/common/helpers/highlight';

// ─── Translation helper ────────────────────────────────────────────────────────

export const trans = (key, fallback, params = {}) => {
  const out = app.translator?.trans(key, params);
  return out && out !== key ? out : fallback;
};

// ─── Number guard ─────────────────────────────────────────────────────────────

export const numberOr = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// ─── Color helpers ────────────────────────────────────────────────────────────

export const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(63,136,246,${alpha})`;
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(63,136,246,${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// Relative luminance (WCAG 2.1).
export const hexLuminance = (hex) => {
  if (!hex) return 0;
  const h = hex.replace('#', '');
  if (h.length !== 6) return 0;
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(parseInt(h.substring(0, 2), 16));
  const g = toLinear(parseInt(h.substring(2, 4), 16));
  const b = toLinear(parseInt(h.substring(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Returns { bg, color } for tag-icon / category-icon elements.
// In dark mode, colors with luminance below the threshold are inverted so
// they remain visible on dark backgrounds (e.g. a "Preto"/Black tag).
export const iconColors = (hex, bgAlpha = 0.12) => {
  const fallback = '#3f88f6';
  const color = hex || fallback;
  const isDark = typeof document !== 'undefined' &&
    document.documentElement.dataset.theme?.startsWith('dark');

  if (isDark && hexLuminance(color) < 0.08) {
    // Invert the hex so very-dark colours flip to a light equivalent
    const h = color.replace('#', '');
    const ri = (255 - parseInt(h.substring(0, 2), 16)).toString(16).padStart(2, '0');
    const gi = (255 - parseInt(h.substring(2, 4), 16)).toString(16).padStart(2, '0');
    const bi = (255 - parseInt(h.substring(4, 6), 16)).toString(16).padStart(2, '0');
    const inv = `#${ri}${gi}${bi}`;
    return { bg: hexToRgba(inv, bgAlpha), color: inv };
  }

  return { bg: hexToRgba(color, bgAlpha), color };
};

// Convenience wrapper — returns the inline style object for tag pill elements.
// Replaces the repetitive `tagColor ? { '--tag-bg': hexToRgba(...), '--tag-color': tagColor } : {}`
// pattern across all components and automatically applies dark-mode inversion.
export const tagPillStyle = (hex, alpha = 0.1) => {
  if (!hex) return {};
  const { bg, color } = iconColors(hex, alpha);
  return { '--tag-bg': bg, '--tag-color': color };
};

// ─── User display name ────────────────────────────────────────────────────────

export const displayName = (user) =>
  user?.displayName?.() || user?.username?.() || '';

// ─── Relative time label ──────────────────────────────────────────────────────

export const formatTimeLabel = (dateValue) => {
  if (!dateValue) return '';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(date.getTime())) return '';

  const now  = new Date();
  const sod  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const soy  = new Date(sod.getTime() - 86400000);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (date >= sod) return trans('ramon-avocado.forum.home.today_time', 'Today, {time}', { time });
  if (date >= soy) return trans('ramon-avocado.forum.home.yesterday_time', 'Yesterday, {time}', { time });
  
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${dateLabel}, ${time}`;
};

// ─── Text truncation (delegates to Flarum core) ──────────────────────────────

export const truncate = (str, max = 150) =>
  str ? coreTruncate(str, max) : '';

// ─── Search highlight (delegates to Flarum core) ─────────────────────────────
// Core highlight(string, phrase, length?, safe?) handles HTML escaping,
// <mark> wrapping and truncation around the first match.

export const highlight = (text, query, maxLength = 0) => {
  if (!text) return '';
  return coreHighlight(text, query || undefined, maxLength || undefined);
};

// ─── Discussion first-post excerpt ────────────────────────────────────────────

export const postPreview = (discussion, max = 150) => {
  try {
    const plain = discussion.firstPost?.()?.contentPlain?.() || '';
    if (plain) return truncate(plain, max);
    return truncate(discussion.attribute?.('firstPostContent') || '', max);
  } catch (e) {
    return '';
  }
};

// ─── Route helpers ────────────────────────────────────────────────────────────

export const safeRoute = (name, params = {}, fallback = '#') => {
  try { return app.route(name, params); } catch (e) { return fallback; }
};

export const discussionRoute = (discussion, near) => {
  try { return app.route.discussion(discussion, near); } catch (e) { return '#'; }
};

export const tagRoute = (tag) => {
  try { return app.route('tag', { tags: tag.slug() }); } catch (e) { return '#'; }
};

// ─── Path normalization (prevent traversal attacks) ───────────────────────────
// Removes ../ and \.\ sequences to prevent directory traversal.

const normalizePath = (path) => {
  return String(path)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .split('/')
    .filter((segment, i) => {
      if (segment === '.' || segment === '') return i === 0;
      if (segment === '..') return false;
      return true;
    })
    .join('/');
};

// ─── Asset URL resolver ───────────────────────────────────────────────────────
// Validates that the resolved URL uses a safe protocol (http/https) to prevent
// javascript: or data: URI injection when used in <img src> or CSS url().
// Also normalizes paths to prevent directory traversal attacks.

export const resolveAssetUrl = (assetPath) => {
  if (!assetPath) return null;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  // Block dangerous protocols (javascript:, data:, vbscript:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetPath)) return null;

  const normalized = normalizePath(assetPath);

  const base = app.forum?.attribute('assetsBaseUrl') || app.forum?.attribute('baseUrl');
  if (!base) return null; // No base URL — refuse to construct a relative path

  const suffix = app.forum?.attribute('assetsBaseUrl')
    ? ''
    : '/assets';
  return base.replace(/\/+$/, '') + suffix + '/' + normalized;
};

// Returns a properly quoted and escaped CSS url() value.
// Prevents CSS injection by escaping parentheses, quotes, and backslashes.
export const safeCssUrl = (url) => {
  if (!url) return 'none';
  // Remove any characters that could break out of url('...')
  const escaped = String(url).replace(/[\\()'";]/g, '');
  return `url('${escaped}')`;
};

// ─── Clipboard helper ─────────────────────────────────────────────────────────

export const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
};

// ─── Design constants ─────────────────────────────────────────────────────────

export const FALLBACK_COLORS = [
  '#f0b213', '#3f88f6', '#4ec46a', '#e84393', '#9b59b6',
  '#e67e22', '#1abc9c', '#e74c3c', '#2ecc71', '#3498db',
];

export const FALLBACK_ICONS = [
  'fas fa-tag', 'fas fa-folder', 'fas fa-comments', 'fas fa-star',
  'fas fa-fire', 'fas fa-bolt', 'fas fa-globe', 'fas fa-heart',
];

// ─── Navigation helper ────────────────────────────────────────────────────────

export const navigate = (e, href) => {
  e.preventDefault();
  m.route.set(href);
};

// ─── User profile route ───────────────────────────────────────────────────────

export const userRoute = (user) =>
  safeRoute('user', { username: user?.username?.() || '' });

// ─── Featured tag IDs ─────────────────────────────────────────────────────────

export const getFeaturedTagIds = () => {
  try {
    const raw = app.forum?.attribute('avocadoFeaturedTags');
    return new Set((raw ? JSON.parse(raw) : []).map(String));
  } catch (_) {
    return new Set();
  }
};

// ─── Skeleton cards ───────────────────────────────────────────────────────────

export const renderThreadSkeleton = (count = 3) =>
  Array.from({ length: count }, (_, i) =>
    m('div', { key: i, className: 'AvocadoHome-skeletonCard' }, [
      m('div', { className: 'AvocadoHome-skeletonAvatar' }),
      m('div', { className: 'AvocadoHome-skeletonBody' }, [
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm' }),
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--lg' }),
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md' }),
      ]),
    ])
  );

export const renderPostSkeleton = (count = 3) =>
  Array.from({ length: count }, (_, i) =>
    m('div', { key: i, className: 'AvocadoSearch-postSkeleton' }, [
      m('div', { className: 'AvocadoHome-skeletonAvatar' }),
      m('div', { className: 'AvocadoHome-skeletonBody' }, [
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm' }),
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--lg' }),
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md' }),
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm', style: 'width:28%' }),
      ]),
    ])
  );

// ─── Icon/category style helpers ─────────────────────────────────────────────

export const iconPillStyle = (hex, alpha = 0.12) => {
  if (!hex) return {};
  const { bg, color } = iconColors(hex, alpha);
  return { '--icon-bg': bg, '--icon-color': color };
};

export const categoryCardStyle = (hex, alpha = 0.12) => {
  if (!hex) return {};
  const { bg, color } = iconColors(hex, alpha);
  return { '--cat-bg': bg, '--cat-color': color };
};

// ─── Load-more button ─────────────────────────────────────────────────────────

export const renderLoadMore = (label, onclick) =>
  m('div', { className: 'AvocadoDiscussions-loadMore' }, [
    m('button', { className: 'Button AvocadoDiscussions-loadMoreBtn', onclick }, label),
  ]);

// ─── Empty state ──────────────────────────────────────────────────────────────

export const renderEmpty = (label) =>
  m('div', { className: 'AvocadoDiscussions-empty' }, label);
