// ─── Colored utilities ────────────────────────────────────────────────────────
// Applies a tag color to the entire page via CSS custom properties on <body>.
// Integrated from ramon/colored extension — JS sets two vars:
//   --colored-color    → the tag's hex/rgb color
//   --colored-contrast → 'var(--text-on-dark)' or 'var(--text-on-light)'
// LESS in forum/colored.less consumes these vars.

import isDark from 'flarum/common/utils/isDark';

let lastAppliedColor: string | null | undefined = undefined;

// Suppress CSS transitions for 2 frames so color vars snap instantly
// (prevents accent-color, header-bg, etc. from visibly animating on navigation).
function suppressTransitions(): void {
  document.documentElement.classList.add('colored--instant');
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document.documentElement.classList.remove('colored--instant')
    )
  );
}

export function applyColor(color: string | null | undefined): void {
  if (color === lastAppliedColor) return;
  lastAppliedColor = color;
  suppressTransitions();
  if (color) {
    const contrast = isDark(color) ? 'var(--text-on-dark)' : 'var(--text-on-light)';
    document.body.style.setProperty('--colored-color', color);
    document.body.style.setProperty('--colored-contrast', contrast);
    document.body.classList.add('colored--active');
  } else {
    document.body.style.removeProperty('--colored-color');
    document.body.style.removeProperty('--colored-contrast');
    document.body.classList.remove('colored--active');
  }
}

export function clearColor(): void {
  applyColor(null);
}
