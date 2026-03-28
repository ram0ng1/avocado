/**
 * Shared utilities for ramon/avocado forum components.
 * Centralises functions that were previously duplicated across
 * index.js, HomePage.js, AllDiscussionsPage.js, TagPage.js and UserProfilePage.js.
 */
import app from 'flarum/forum/app';

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
const hexLuminance = (hex) => {
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

// ─── Text truncation ──────────────────────────────────────────────────────────

export const truncate = (str, max = 150) =>
  str && str.length > max ? str.slice(0, max).trimEnd() + '…' : (str || '');

// ─── Search highlight ─────────────────────────────────────────────────────────
// Returns a Mithril trusted-HTML vnode with matched terms wrapped in <mark>.
// Text is HTML-escaped before insertion so there is no XSS risk.

const _escHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export const highlight = (text, query, maxLength = 0) => {
  if (!text) return '';
  let str = maxLength > 0 && text.length > maxLength
    ? text.slice(0, maxLength).trimEnd() + '…'
    : text;
  const safe = _escHtml(str);
  if (!query) return m.trust(safe);
  const words = String(query).trim().split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return m.trust(safe);
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return m.trust(safe.replace(re, '<mark>$1</mark>'));
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

// ─── Asset URL resolver ───────────────────────────────────────────────────────

export const resolveAssetUrl = (assetPath) => {
  if (!assetPath) return null;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;

  const base = app.forum?.attribute('assetsBaseUrl') || app.forum?.attribute('baseUrl');
  if (!base) return String(assetPath);

  const suffix = app.forum?.attribute('assetsBaseUrl')
    ? ''
    : '/assets';
  return base.replace(/\/+$/, '') + suffix + '/' + String(assetPath).replace(/^\/+/, '');
};

// ─── Clipboard helper (no deprecated execCommand) ─────────────────────────────

export const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Legacy fallback — wrapped in try/catch, kept for older browsers
  try {
    const ta = Object.assign(document.createElement('textarea'), {
      value: text,
      readOnly: true,
    });
    Object.assign(ta.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy'); // eslint-disable-line no-unused-vars
    document.body.removeChild(ta);
  } catch (_) {}
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
