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

// ── Ossos ─────────────────────────────────────────────────────────────────────
// Um esqueleto montado com a marcação REAL do que vai substituí-lo (as mesmas
// classes do cartão, do hero, das abas) herda caixa, recuo e espaçamento do CSS
// de verdade — em qualquer largura de tela, sem números copiados à mão. Só o
// texto vira osso: uma linha que ocupa a altura de linha do elemento em que
// está, com a largura inventada.

/** Uma linha de texto em osso, dentro de um elemento real. */
export const bone = (width: string): any => m('span', { className: 'AvocadoBone AvocadoBone--text', style: { width } }, ' ');

/** Classes de um elemento real pintado inteiro como osso (avatar, botão, pílula): o conteúdo só dá a largura. */
export const BONE_FILL = 'AvocadoBone AvocadoBone--fill';

// ── Profile card skeletons ────────────────────────────────────────────────────
// Os cartões das abas do perfil: PostCard (posts, curtidas, menções) e
// ThreadCard (discussões). Larguras variam por cartão para não parecer carimbo.
const PROFILE_TITLES = ['34%', '22%', '46%'];
const PROFILE_EXCERPTS = [['72%'], ['100%', '38%'], ['88%']];

export const renderProfileCardSkeleton = (kind: 'post' | 'thread' = 'post', count = 3, bookmark = false): any[] =>
  Array.from({ length: count }, (_, i) => {
    const post = kind === 'post';
    // Para quem está logado o cartão real reserva o lugar dos controles (⋮) e,
    // no ThreadCard com os salvos ligados (`bookmark`), o do botão de salvar —
    // os dois só aparecem no hover, mas ocupam largura.
    const controls = !!app.session.user;

    return m('div', { key: i, className: 'AvocadoHome-threadCard AvocadoHome-threadCard--skeleton', 'aria-hidden': 'true' }, [
      m('div', { className: 'AvocadoHome-threadHead' }, [
        m('div', { className: `AvocadoHome-avatarWrap ${BONE_FILL}` }),
        m('div', { className: 'AvocadoHome-threadMain' }, [
          m('div', { className: 'AvocadoHome-threadMeta' }, [
            m('span', { className: 'AvocadoHome-threadAuthor' }, bone('86px')),
            m('span', { className: 'AvocadoHome-threadTime' }, bone('48px')),
            // Só o PostCard mostra as tags da discussão na linha do autor.
            post && m('span', { className: `AvocadoHome-tagPill ${BONE_FILL}` }, bone('84px')),
            post && m('span', { className: `AvocadoHome-tagPill ${BONE_FILL}` }, bone('62px')),
          ]),
          m('span', { className: 'AvocadoHome-threadTitle' }, bone(PROFILE_TITLES[i % PROFILE_TITLES.length])),
          m(
            'p',
            { className: `AvocadoHome-threadExcerpt${post ? ' AvocadoUserPage-postExcerpt' : ''}` },
            PROFILE_EXCERPTS[i % PROFILE_EXCERPTS.length].map((width) => bone(width))
          ),
        ]),
        m('div', { className: 'AvocadoHome-threadActions' }, [
          !post && controls && bookmark && m('span', { className: 'AvocadoThreadCard-bookmarkBtn AvocadoBone' }),
          controls && m('span', { className: 'AvocadoHome-threadControls-toggle AvocadoBone' }),
          // O botão de verdade, com ícone e rótulo traduzido escondidos: a largura é a dele.
          m('span', { className: `AvocadoHome-replyBtn ${BONE_FILL}` }, [
            m('i', { className: post ? 'fas fa-arrow-right' : 'fas fa-reply' }),
            // Num <span>: texto solto não é filho que o osso consiga esconder.
            m('span', {}, app.translator.trans(post ? 'ramon-avocado.forum.home.view' : 'ramon-avocado.forum.home.reply_label')),
          ]),
        ]),
      ]),
      // Última resposta: só o ThreadCard a mostra.
      !post &&
        m(
          'div',
          { className: 'AvocadoHome-threadReplyGroup' },
          m('div', { className: 'AvocadoHome-replyCard' }, [
            m('span', { className: 'AvocadoHome-replyCard-line' }, [
              m('div', { className: `AvocadoHome-replyCard-avatar ${BONE_FILL}` }),
              m('span', { className: 'AvocadoHome-replyCard-name' }, bone('96px')),
              m('span', { className: 'AvocadoHome-replyCard-text' }, bone('70%')),
            ]),
            m('span', { className: 'AvocadoHome-replyCard-seeMore' }, bone('148px')),
          ])
        ),
      m('div', { className: 'AvocadoHome-threadStats' }, [
        !post && m('span', { className: 'AvocadoHome-statBtn' }, bone('70px')),
        m('span', { className: 'AvocadoHome-statBtn' }, bone('84px')),
      ]),
    ]);
  });

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

// ── Support skeletons (linkrobins/support) ────────────────────────────────────
// Reaproveitam as classes da própria extensão (.LinkRobinsSupport-list, -row,
// -reply, -categoryCard) para que o esqueleto tenha a moldura, o recuo e as
// divisórias do conteúdo que vai substituí-lo, e não uma caixa parecida.

export const renderSupportListSkeleton = (count = 5): any =>
  m(
    'div',
    { className: 'LinkRobinsSupport-list AvocadoSupport-skeletonList' },
    Array.from({ length: count }, (_, i) =>
      m('div', { key: i, className: 'LinkRobinsSupport-row AvocadoSupport-skeletonRow' }, [
        m('div', { className: 'LinkRobinsSupport-row-main' }, [
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--subject' }),
          m('div', { className: 'AvocadoSupport-skeletonMeta' }, [
            m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--metaCat' }),
            m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--metaUser' }),
            m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--metaDate' }),
          ]),
        ]),
        m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--status' }),
      ])
    )
  );

export const renderSupportTicketSkeleton = (count = 3): any =>
  m('div', { className: 'AvocadoSupport-skeletonTicket' }, [
    m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--ticketMeta' }),
    m(
      'div',
      { className: 'LinkRobinsSupport-replies' },
      Array.from({ length: count }, (_, i) =>
        m('div', { key: i, className: 'LinkRobinsSupport-reply AvocadoSupport-skeletonReply' }, [
          m('div', { className: 'AvocadoSupport-skeletonMeta' }, [
            m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--metaUser' }),
            m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--metaDate' }),
          ]),
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--body' }),
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--bodyShort' }),
        ])
      )
    ),
  ]);

export const renderSupportCategoriesSkeleton = (count = 3): any =>
  m(
    'div',
    { className: 'AvocadoSupport-skeletonCategories' },
    Array.from({ length: count }, (_, i) =>
      m('div', { key: i, className: 'LinkRobinsSupport-categoryCard AvocadoSupport-skeletonCategory' }, [
        m('div', { className: 'AvocadoSupport-skeletonCategory-icon' }),
        m('div', { className: 'AvocadoSupport-skeletonCategory-text' }, [
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--catName' }),
          m('div', { className: 'AvocadoHome-skeletonLine AvocadoSupport-skeletonLine--catDesc' }),
        ]),
      ])
    )
  );
