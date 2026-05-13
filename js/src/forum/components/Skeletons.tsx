// ─── Avocado skeleton render functions ───────────────────────────────────────
// Single source of truth for all preloader skeletons across the theme.
// Import from utils.ts (which re-exports everything here) for backward compat.

import app from 'flarum/forum/app';

// ── Thread card skeleton ──────────────────────────────────────────────────────
// Mirrors ThreadCard: head (avatar + main + actions) + stats row.
export const renderThreadSkeleton = (count = 3): any[] =>
  Array.from({ length: count }, (_, i) =>
    m('div', { key: i, className: 'AvocadoHome-skeletonCard' }, [
      m('div', { className: 'AvocadoHome-skeletonHead' }, [
        m('div', { className: 'AvocadoHome-skeletonAvatar' }),
        m('div', { className: 'AvocadoHome-skeletonBody' }, [
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--meta' }),
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--title' }),
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--excerpt' }),
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--excerpt2' }),
        ]),
        m(
          'div',
          { className: 'AvocadoHome-skeletonActions' },
          // Hidden content drives natural width — the shimmer bg on the wrapper shows,
          // children are invisible via CSS (> * { visibility: hidden }).
          m('div', { className: 'AvocadoHome-skeletonActions-reply', 'aria-hidden': 'true' }, [
            m('i', { className: 'fas fa-reply', 'aria-hidden': 'true' }),
            m('span', {}, app.translator.trans('ramon-avocado.forum.home.reply_label')),
          ])
        ),
      ]),
      m('div', { className: 'AvocadoHome-skeletonStats' }, [
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--stat' }),
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--stat' }),
      ]),
    ])
  );

export const renderDiscSkeleton = renderThreadSkeleton;

// ── Post search skeleton ──────────────────────────────────────────────────────
// Mirrors AvocadoSearch-postCard layout:
//   head  → avatar(36) + meta (author + time)
//   pill  → discussion link
//   excerpt → 2 lines of text
export const renderPostSkeleton = (count = 3): any[] =>
  Array.from({ length: count }, (_, i) =>
    m('div', { key: i, className: 'AvocadoSearch-postSkeleton' }, [
      // Head: avatar + meta
      m('div', { className: 'AvocadoSearch-postSkeleton-head' }, [
        m('div', { className: 'AvocadoSearch-postSkeleton-avatar' }),
        m('div', { className: 'AvocadoSearch-postSkeleton-meta' }, [
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm' }),
          m('div', { className: 'AvocadoHome-skeletonLine', style: 'height:10px;width:70px' }),
        ]),
      ]),
      // Discussion link pill
      m('div', { className: 'AvocadoSearch-postSkeleton-pill' }),
      // Excerpt lines
      m('div', { className: 'AvocadoSearch-postSkeleton-excerpt' }, [
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--md' }),
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoHome-skeletonLine--sm' }),
      ]),
    ])
  );

// ── Showcase card skeleton ────────────────────────────────────────────────────
// Used by renderShowcaseSlider() in HomePage.
export const renderShowcaseSkeleton = (count: number): any[] =>
  Array.from({ length: count }, (_, i) => m('div', { key: i, className: 'AvocadoHome-showcaseSkeleton' }));

// ── Discussion page nav skeleton ──────────────────────────────────────────────
// Mirrors Page-sidebar > DiscussionPage-nav.
// isLoggedIn=false → guest view: no Reply or Subscription dropdowns.
export const renderDiscussionNavSkeleton = (isLoggedIn = true): any =>
  m(
    'div',
    { className: 'Page-sidebar' },
    m(
      'nav',
      { className: 'DiscussionPage-nav' },
      m('ul', {}, [
        // Reply / controls + Subscription — logged-in users only
        ...(isLoggedIn
          ? [
              m('li', { className: 'item-controls' }, m('div', { className: 'AvocadoSkeleton-navSplitMain AvocadoSkeleton-navSplitMain--primary' })),
              m(
                'li',
                { className: 'item-subscription' },
                m('div', { className: 'AvocadoSkeleton-navSplitMain AvocadoSkeleton-navSplitMain--secondary' })
              ),
            ]
          : []),
        // Scrubber — always shown
        m('li', { className: 'item-scrubber' }, m('div', { className: 'AvocadoSkeleton-navScrubber' })),
      ]) // ul
    ) // nav
  ); // Page-sidebar
