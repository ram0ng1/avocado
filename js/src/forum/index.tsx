// @ts-nocheck — bootstrap file: dozens of extend/override callbacks with
// implicit `any` parameters. Properly typing each would require pinning down
// every patched core component's shape. The page components this file wires
// together are individually type-checked.
import { extend, override } from 'flarum/common/extend';
import trustedHtml from '../common/trustedHtml';
import { installTagIconSvg } from '../common/tagIconSvg';
import { measureTightViewBox } from '../common/logoViewBox';
import Button from 'flarum/common/components/Button';
import PostControls from 'flarum/forum/utils/PostControls';
import Tooltip from 'flarum/common/components/Tooltip';
import LinkButton from 'flarum/common/components/LinkButton';
import Avatar from 'flarum/common/components/Avatar';
import DiscussionListItem from 'flarum/forum/components/DiscussionListItem';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import Search from 'flarum/forum/components/Search';
import HeaderSecondary from 'flarum/forum/components/HeaderSecondary';
import HeaderDropdown from 'flarum/forum/components/HeaderDropdown';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import IndexPage from 'flarum/forum/components/IndexPage';
import CommentPost from 'flarum/forum/components/CommentPost';
import PostEdited from 'flarum/forum/components/PostEdited';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import WelcomeHero from 'flarum/forum/components/WelcomeHero';
import TagsPage from 'ext:flarum/tags/forum/components/TagsPage';
import sortTags from 'ext:flarum/tags/common/utils/sortTags';

const sortTagsSafe = (tags: any[]): any[] => (sortTags ? sortTags(tags) : tags);
import { applyColor, clearColor } from './colored';
import UserPage from 'flarum/forum/components/UserPage';
import UserControls from 'flarum/forum/utils/UserControls';
import DiscussionHero from 'flarum/forum/components/DiscussionHero';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import PageStructure from 'flarum/forum/components/PageStructure';
// O PostStream é code-split: nada de import estático. O extend/override por
// string deixa o flarum.reg.onLoad() aplicar o patch quando o módulo carrega.
import { tagPageView } from './components/TagsPage';
import HomePage from './components/HomePage';
import normalizeRevManifest from './utils/revManifest';
// O modal de lembrete e a página do changelog são chunks lazy. O
// `normalizeRevManifest` (initializer abaixo) põe o `?v=<hash>` nas URLs dos
// chunks; sem ele um chunk ficaria preso no cache "immutable" do CDN.
const BookmarkModal = () => import('./components/BookmarkModal');
const AvocadoChangelogPage = () => import('./components/ChangelogPage');
// A página "Salvos" fica no bundle principal: com o fof/bookmarks ativo ela
// atende a rota dele, e carregar chunk nessa rota colide com os ids numéricos
// do webpack no bundle do fof ("s[t] is not a function").
import AvocadoBookmarksPage from './components/BookmarksPage';
import BookmarkReminderNotification from './components/BookmarkReminderNotification';
import { buildUserPhoneNav, buildHero, buildSidebar } from './components/UserProfileBuilders';

// ─── Lazy route components ────────────────────────────────────────────────────
// O DefaultResolver aceita uma função async que devolve `{ default: Comp }`. O
// autoChunkNameLoader do flarum-webpack-config põe o webpackChunkName em cada import().

// Sem `webpackPrefetch` de propósito: o `<link rel="prefetch">` usaria a URL do
// runtime do webpack, que não existe (o chunk mora em
// `/assets/js/ramon-avocado/forum/components/`), e somaria bytes a todo acesso.

const AllDiscussionsPage = () => import('./components/AllDiscussionsPage');
const AvocadoTagPage = () => import('./components/TagPage');
const AvocadoTeamPage = () => import('./components/TeamPage');
const AvocadoPostsSearchPage = () => import('./components/AvocadoPostsSearchPage');
const AvocadoSearchPage = () => import('./components/AvocadoSearchPage');

// UserProfilePage tem exports nomeados: cada um vira `{ default: Comp }`. Os
// quatro dividem o mesmo chunk.
const AvocadoUserPostsPage = () => import('./components/UserProfilePage').then((m) => ({ default: m.AvocadoUserPostsPage }));
const AvocadoUserDiscussionsPage = () => import('./components/UserProfilePage').then((m) => ({ default: m.AvocadoUserDiscussionsPage }));
const AvocadoUserLikesPage = () => import('./components/UserProfilePage').then((m) => ({ default: m.AvocadoUserLikesPage }));
const AvocadoUserMentionsPage = () => import('./components/UserProfilePage').then((m) => ({ default: m.AvocadoUserMentionsPage }));
import AvocadoDiscussionStats from './components/AvocadoDiscussionStats';
import Footer from 'flarum/forum/components/Footer';
import {
  trans,
  cssString,
  hexLuminance,
  iconColors,
  tagPillStyle,
  resolveAssetUrl,
  copyTextToClipboard,
  truncate,
  safeCssUrl,
  renderThreadSkeleton,
  renderDiscussionNavSkeleton,
  displayName,
  getDiscussionHeroImageUrl,
  tagsRequireHeroImage,
  tagsAreChangelogProducts,
  changelogAttributes,
  uploadDiscussionHeroImage,
  deleteDiscussionHeroImage,
  canEditDiscussionHero,
  sanitizeAdminHtml,
  discussionViews,
  formatViews,
} from './utils';
import {
  toggleBookmark,
  isBookmarked,
  avocadoBookmarksEnabled,
  usesFofBookmarks,
  fofPostButtonInMenu,
  fofTrans,
  BOOKMARKS_PATH,
} from './utils/bookmarks';
import { hoverCardAttrs } from './components/shared/UserHoverCard';
import AvocadoFooter from './components/AvocadoFooter';
import { changelogChips } from './components/shared/ChangelogFields';
import { renderReleaseHero } from './components/shared/ReleaseHero';
import { changelogTagTarget } from './utils/changelog';
import WhoIsReading from './components/shared/WhoIsReading';
import CakedayBadge from './components/shared/CakedayBadge';
import TextEditor from 'flarum/common/components/TextEditor';
import listItems from 'flarum/common/helpers/listItems';
import classList from 'flarum/common/utils/classList';
import humanTime from 'flarum/common/utils/humanTime';
import { installSupportCompat, isSupportPage, isSupportTicketPage, supportToolbar } from './utils/support';
import { installWikiCompat, isWikiIndexPage, isWikiPage, wikiToolbar } from './utils/wiki';
import installComposerDock from './utils/composerDock';
import installComposerPreview from './utils/composerPreview';
import installComposerMorph from './utils/composerMorph';
import installTagsModal from './utils/tagsModal';
import installModalBackdropClasses from './utils/modalBackdrop';
import installReplyTo from './utils/replyTo';
import { realtimeAvailable } from './realtime';
import Application from 'flarum/common/Application';
import extractText from 'flarum/common/utils/extractText';

// ─── Settings helpers ─────────────────────────────────────────────────────────

// O PHP usa boolval no serializeToForum: chega true/false/null.
const settingEnabled = (key, defaultValue = true) => {
  const val = app.forum?.attribute(key);
  if (val === null || val === undefined) return defaultValue;
  return !!val;
};

// A URL tem filtros de gambit (ex.: filter[author]=ramon)? O Mithril transforma
// filter[key]=value num objeto em m.route.param('filter').
const hasFilterParams = () => {
  const filter = m.route.param('filter');
  return filter !== null && filter !== undefined && typeof filter === 'object' && Object.keys(filter).length > 0;
};

const hasIndexFilters = () => {
  // 'sort' fica de fora para /?sort=latest continuar na home do tema; 'filter'
  // entra porque busca só com gambit ainda mostra resultados.
  if (hasFilterParams()) return true;
  return ['q', 'tags', 'page'].some((name) => {
    const value = m.route.param(name);
    return value !== null && value !== undefined && String(value).length > 0;
  });
};

const hasSearchQuery = () => {
  const q = m.route.param('q');
  if (q !== null && q !== undefined && String(q).length > 0) return true;
  // Busca só com gambit: sem texto, mas com filtros (ex.: author:ramon).
  return hasFilterParams();
};

// A home do tema segue o v2_enabled (não há setting própria) e sai de cena com
// filtros ativos.
const customHomeEnabled = () => settingEnabled('avocadoV2Enabled', true) && !hasIndexFilters();

const setClassName = (vdom, className, enabled) => {
  if (!vdom?.attrs) return;
  const current = typeof vdom.attrs.className === 'string' ? vdom.attrs.className : '';
  const classes = current.split(/\s+/).filter(Boolean);
  const hasClass = classes.includes(className);
  if (enabled && !hasClass) classes.push(className);
  if (!enabled && hasClass) {
    vdom.attrs.className = classes.filter((n) => n !== className).join(' ');
    return;
  }
  vdom.attrs.className = classes.join(' ');
};

// ─── Post permalink ────────────────────────────────────────────────────────────

const getPostPermalink = (post) => {
  const discussion = post?.discussion?.();
  if (!discussion) return window.location.href;
  const near = typeof post.number === 'function' ? post.number() : undefined;
  const relative = app.route.discussion(discussion, near);
  return new URL(relative, window.location.origin).toString();
};

// ─── Code block: language label + copy button ─────────────────────────────────
// Os apelidos comuns ganham nome curto; o resto sai como foi escrito (o CSS põe
// em maiúsculas). `null` = não é linguagem, a barra fica sem rótulo.
const CODE_LANG_LABELS: Record<string, string | null> = {
  js: 'JS',
  javascript: 'JS',
  ts: 'TS',
  typescript: 'TS',
  yml: 'YAML',
  sh: 'Shell',
  bash: 'Shell',
  shell: 'Shell',
  zsh: 'Shell',
  py: 'Python',
  rb: 'Ruby',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  md: 'Markdown',
  text: null,
  txt: null,
  plain: null,
  plaintext: null,
  nohighlight: null,
};

/**
 * Linguagem declarada no bloco (```python / [code=python]), ou null. O
 * hljs-loader, ao adivinhar, acrescenta `hljs` e depois `language-<palpite>`:
 * só vale a classe que vem antes de `hljs`, senão Python sairia como "SCSS".
 */
const declaredCodeLanguage = (code: Element | null): string | null => {
  if (!code) return null;

  for (const cls of Array.from(code.classList)) {
    if (cls === 'hljs') return null;

    const match = /^lang(?:uage)?-(.+)$/.exec(cls);
    if (!match) continue;

    const lang = match[1].toLowerCase();
    return lang in CODE_LANG_LABELS ? CODE_LANG_LABELS[lang] : lang;
  }

  return null;
};

const initCodeBlocks = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    if (pre.querySelector('.avocado-code-copy')) return;

    // Rótulo na barra do topo, via pre[data-code-lang]::before (mixin
    // .avocado-code-block) — o JS não cria elemento, só informa o texto.
    const lang = declaredCodeLanguage(pre.querySelector(':scope > code'));
    if (lang) pre.dataset.codeLang = lang;

    const makeIcon = (cls: string) => {
      const i = document.createElement('i');
      i.className = `fas ${cls}`;
      i.setAttribute('aria-hidden', 'true');
      return i;
    };
    const btn = document.createElement('button');
    btn.className = 'avocado-code-copy';
    btn.setAttribute('aria-label', trans('ramon-avocado.forum.post.copy_code', 'Copy code'));
    btn.replaceChildren(makeIcon('fa-copy'));

    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      const text = code ? code.textContent || '' : pre.textContent || '';
      navigator.clipboard
        .writeText(text)
        .then(() => {
          btn.classList.add('avocado-code-copy--copied');
          btn.replaceChildren(makeIcon('fa-check'));
          setTimeout(() => {
            btn.classList.remove('avocado-code-copy--copied');
            btn.replaceChildren(makeIcon('fa-copy'));
          }, 1800);
        })
        .catch(() => {});
    });

    pre.appendChild(btn);
  });
};

// ─── Fancybox gallery arrows (flectar/flarum-fancybox) ────────────────────────
// A extensão monta o carrossel sem setas nem contador. Ele já trata, por
// delegação, cliques em [data-carousel-go-prev/next] e reescreve
// [data-carousel-page/pages]: basta pôr os botões lá dentro. Estes hooks rodam
// depois do refreshContent dela, com o carrossel pronto (.fancybox-ready).
const initGalleryNav = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('.fancybox-gallery.fancybox-ready').forEach((gallery) => {
    if (gallery.querySelector(':scope > .avocado-gallery-nav')) return;

    const count = gallery.querySelectorAll('.f-carousel__slide').length;
    if (count < 2) return;

    const makeIcon = (cls: string) => {
      const i = document.createElement('i');
      i.className = `fas ${cls}`;
      i.setAttribute('aria-hidden', 'true');
      return i;
    };
    const makeButton = (dir: 'prev' | 'next', label: string, icon: string) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `avocado-gallery-nav avocado-gallery-nav--${dir}`;
      btn.setAttribute(`data-carousel-go-${dir}`, '');
      btn.setAttribute('aria-label', label);
      btn.appendChild(makeIcon(icon));
      return btn;
    };

    const prev = makeButton('prev', trans('ramon-avocado.forum.post.gallery_prev', 'Previous photos'), 'fa-chevron-left');
    const next = makeButton('next', trans('ramon-avocado.forum.post.gallery_next', 'Next photos'), 'fa-chevron-right');
    // Estado inicial: o carrossel só reavalia os botões na próxima troca, e a
    // galeria abre na 1ª página com `infinite: false`.
    prev.setAttribute('aria-disabled', 'true');

    // Uma foto por página (Fancybox.less), então página = foto.
    const page = document.createElement('span');
    page.setAttribute('data-carousel-page', '');
    page.textContent = '1';
    const pages = document.createElement('span');
    pages.setAttribute('data-carousel-pages', '');
    pages.textContent = String(count);

    const counter = document.createElement('span');
    counter.className = 'avocado-gallery-count';
    counter.setAttribute('title', trans('ramon-avocado.forum.post.gallery_count', '{count} photos', { count }));
    const numbers = document.createElement('span');
    numbers.append(page, ' / ', pages);
    counter.append(makeIcon('fa-images'), numbers);

    gallery.append(prev, next, counter);
  });
};

// ─── Reaction count: inject "1" badge when extension omits it ────────────────
// O fof/reactions só desenha <span class="count"> com count > 1; para 1 a
// contagem sai do aria-label.
const fixReactionCounts = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('.Button-emoji-parent').forEach((btn) => {
    if (btn.querySelector('.count')) return;
    const label = btn.getAttribute('aria-label') || '';
    const match = label.match(/\((\d+)/);
    if (!match) return;
    const count = parseInt(match[1], 10);
    const innerSpan = btn.querySelector<HTMLElement>('.Button-labelText > span');
    if (!innerSpan) return;
    const span = document.createElement('span');
    span.className = 'count';
    span.textContent = String(count);
    innerSpan.appendChild(span);
  });
};

// ─── Unreact button: replace generic SVG with the user's reacted emoji ───────
// Depois de reagir, o botão de desfazer usa o mesmo smiley do de reagir: troca
// pelo emoji do selo ativo, que fica no Post-footer.
const fixUnreactButton = (root: HTMLElement | null) => {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('.Reactions').forEach((wrapper) => {
    // Reagido: o botão fica direto em .Reactions, sem o wrapper .Reactions--react.
    if (wrapper.querySelector('.Reactions--react')) return;
    const btn = wrapper.querySelector<HTMLElement>('.Reactions--ShowReactions');
    if (!btn || btn.dataset.emojiFixed) return;

    const postMain = wrapper.closest<HTMLElement>('.Post-main');
    if (!postMain) return;
    const activeBadge = postMain.querySelector<HTMLElement>('.Button-emoji-parent.active');
    if (!activeBadge) return;

    const emojiEl = activeBadge.querySelector<HTMLElement>('img.emoji, .emoji, .reaction-icon');
    if (!emojiEl) return;

    const svgEl = btn.querySelector<SVGElement>('svg.button-react');
    if (!svgEl) return;

    const emojiClone = emojiEl.cloneNode(true) as HTMLElement;
    emojiClone.style.width = '18px';
    emojiClone.style.height = '18px';
    svgEl.replaceWith(emojiClone);
    btn.dataset.emojiFixed = '1';
    btn.classList.add('active');
  });
};

// ─── Fixed-avatar badge sync ──────────────────────────────────────────────────

const syncUserOnline = (component) => {
  const root = component.element;
  if (!root) return;
  const side = root.querySelector('.Post-side');
  if (!side) return;
  // Roda a cada redraw (o "online" vence sem o model mudar), então só escreve no
  // DOM quando o estado muda, sem mutar atributos à toa em cada post visível.
  const online = !!root.querySelector('.PostUser-name .UserOnline, .Post-header .UserOnline');
  if (side.classList.contains('Post-side--online') !== online) side.classList.toggle('Post-side--online', online);
};

const isExternalLink = (link) => {
  try {
    const url = new URL(link.href, window.location.href);
    return url.hostname !== window.location.hostname;
  } catch (_) {
    return false;
  }
};

// Link "cru": o texto visível é a própria URL (ou vazio). Sem contexto a
// preservar, o link inteiro vira o placeholder.
const isRawUrlLink = (link) => {
  const text = (link.textContent || '').trim();
  if (!text) return true;
  if (text === link.href) return true;
  if (/^https?:\/\//i.test(text)) return true;
  return false;
};

// data-avocado-gated evita reprocessar nos redraws do onupdate.
const buildGuestLinkPlaceholder = (label) => {
  const placeholder = document.createElement('span');
  placeholder.className = 'AvocadoGuestLink';
  placeholder.setAttribute('data-avocado-gated', '1');
  placeholder.setAttribute('role', 'button');
  placeholder.tabIndex = 0;

  const icon = document.createElement('i');
  icon.className = 'fas fa-lock';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'AvocadoGuestLink-label';
  text.textContent = label;

  placeholder.appendChild(icon);
  placeholder.appendChild(text);

  const handler = () => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal').then((M) => app.modal.show(M));
  placeholder.addEventListener('click', handler);
  placeholder.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handler();
  });

  return placeholder;
};

const gateGuestLinks = (component) => {
  if (app.session.user) return;
  if (!settingEnabled('avocadoHideLinksForGuests', false)) return;
  const root = component.element;
  if (!root) return;
  const body = root.querySelector('.Post-body');
  if (!body) return;

  // Só links externos são trocados. O HTML do post já é a saída do formatter
  // renderizada pelo core, então pode ser alterado direto.
  const label = trans('ramon-avocado.forum.link_cta.placeholder', 'Login to view link');

  body.querySelectorAll('a[href]:not([data-avocado-gated])').forEach((link) => {
    if (!isExternalLink(link)) return;

    const placeholder = buildGuestLinkPlaceholder(label);
    const parent = link.parentNode;
    if (!parent) return;

    if (isRawUrlLink(link)) {
      parent.replaceChild(placeholder, link);
      return;
    }

    // Mantém o texto original do link, para a frase continuar legível, e põe o
    // placeholder logo depois.
    while (link.firstChild) {
      parent.insertBefore(link.firstChild, link);
    }
    parent.insertBefore(document.createTextNode(' ('), link);
    parent.insertBefore(placeholder, link);
    parent.insertBefore(document.createTextNode(')'), link);
    parent.removeChild(link);
  });
};

// ─── Threads style: inject tagRow + title into the OP CommentPost ────────────
const initThreadsTitleBlock = (component) => {
  if (!settingEnabled('avocadoThreadsStyle', false)) return;
  const post = component.attrs?.post;
  if (post?.number?.() !== 1) return;
  const root = component.element as HTMLElement | null;
  if (!root || root.dataset.avocadoThreadsInited) return;

  const discussion = post.discussion?.();
  if (!discussion) return;

  const postMain = root.querySelector<HTMLElement>('.Post-main');
  const postHeader = postMain?.querySelector<HTMLElement>('.Post-header');
  if (!postMain || !postHeader) return;

  const tags = (discussion.tags?.() || []).filter(Boolean);
  const tagRow = document.createElement('div');
  tagRow.className = 'AvocadoThreads-tagRow';
  tags.forEach((tag) => {
    const pill = document.createElement('a');
    pill.className = 'AvocadoHome-tagPill';
    const color = tag.color?.();
    if (color) {
      const styleObj = tagPillStyle(color, 0.12);
      Object.entries(styleObj).forEach(([k, v]) => {
        if (k.startsWith('--')) pill.style.setProperty(k, String(v));
      });
    }
    const slug = tag.slug?.() || '';
    const href = app.route('tag', { tags: slug });
    pill.setAttribute('href', href);
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      m.route.set(href);
    });
    if (tag.icon?.()) {
      const icon = document.createElement('i');
      icon.className = tag.icon();
      icon.setAttribute('aria-hidden', 'true');
      pill.appendChild(icon);
      pill.appendChild(document.createTextNode('\u00A0'));
    }
    pill.appendChild(document.createTextNode(tag.name?.() || ''));
    tagRow.appendChild(pill);
  });

  const titleEl = document.createElement('h2');
  titleEl.className = 'AvocadoThreads-title';
  titleEl.textContent = discussion.title?.() || '';

  postHeader.insertAdjacentElement('afterend', titleEl);
  postHeader.insertAdjacentElement('afterend', tagRow);

  root.dataset.avocadoThreadsInited = '1';
};

// ─── Threads style: add "Back" text to .DiscussionHero-back pill ─────────────
const addThreadsBackLabel = (root: HTMLElement | null) => {
  if (!settingEnabled('avocadoThreadsStyle', false) || !root) return;
  const backBtn = root.querySelector<HTMLElement>('.DiscussionHero-back');
  if (backBtn && !backBtn.querySelector('.DiscussionHero-back-label')) {
    const label = document.createElement('span');
    label.className = 'DiscussionHero-back-label';
    label.textContent = trans('ramon-avocado.forum.header.back', 'Back');
    backBtn.appendChild(label);
  }
};

// Prioridade alta: precisa rodar antes de qualquer initializer que carregue chunk
// (o core lê o rev-manifest uma vez só, na primeira carga). Ver utils/revManifest.
app.initializers.add('avocado-rev-manifest', normalizeRevManifest, 1000);

app.initializers.add(
  'ramon-avocado',
  () => {
    // ── Remove the server-rendered custom-footer copy ─────────────────────
    // O blade do Flarum imprime o `custom_footer` do admin cru, como filho do <body>
    // entre #app e #modal. O tema desenha esse HTML dentro do #app (override do
    // Footer.view), então a cópia do servidor é duplicada e sai daqui. O core não
    // embrulha o `custom_footer`, por isso limpa todo nó entre #app e #modal; os
    // injetores de head/foot nunca caem nesse trecho.
    try {
      const appEl = document.getElementById('app');
      const modalEl = document.getElementById('modal');
      if (appEl && appEl.parentElement === document.body) {
        let node: ChildNode | null = appEl.nextSibling;
        while (node && node !== modalEl) {
          // Sem #modal, para antes dos scripts do boot em vez de apagar o payload do SPA.
          if (!modalEl && /^(script|noscript)$/i.test(node.nodeName)) break;
          const next: ChildNode | null = node.nextSibling;
          document.body.removeChild(node);
          node = next;
        }
      }
    } catch (_) {
      /* nunca bloqueia o boot */
    }

    // ── Register custom routes ─────────────────────────────────────────────
    // /discussions é sempre registrada, para links diretos continuarem funcionando.
    app.routes['avocado-team'] = { path: '/team', component: AvocadoTeamPage };
    // Changelog: /changelog junta os produtos, /changelog/:product filtra um (slug da tag).
    app.routes['avocado-changelog'] = { path: '/changelog', component: AvocadoChangelogPage };
    app.routes['avocado-changelog.product'] = { path: '/changelog/:product', component: AvocadoChangelogPage };
    // Ícone SVG nas tags: os overrides só agem com o switch ligado, e o
    // flarum/tags é opcional para o tema — sem ele não há Tag para estender.
    if ('flarum-tags' in flarum.extensions) installTagIconSvg();
    // linkrobins/support: novo ticket pelo composer e esqueletos de carregamento
    // no lugar dos spinners da extensão. Inerte quando ela não está instalada.
    installSupportCompat();
    // linkrobins/wiki: botão de copiar nos blocos de código dos artigos.
    installWikiCompat(initCodeBlocks);
    // Compositor flutuante alinhado à coluna e pílula de resposta grudada (Composer.less).
    installComposerDock();
    // Prévia dentro do compositor (botão e tela dividida em tela cheia), no
    // lugar da prévia no fim da discussão (admin, aba Discussões).
    installComposerPreview();
    // Tela cheia do compositor do core com metamorfose (admin, aba Discussões).
    installComposerMorph();
    // "↳ Em resposta a" no topo das respostas (admin, aba Discussões).
    installReplyTo();
    // Tag de produto (ou de tipo) do changelog não tem página própria: todo link
    // gerado por `app.route('tag', …)` — rótulos, menu lateral, cartões, o helper
    // `app.route.tag` — já aponta para o changelog. É o lado "dentro do app" do
    // redirecionamento; a entrada de fora por /t/… é o 302 do Middleware\RedirectChangelogTags.
    override(app, 'route', function (original, name, params) {
      const target = name === 'tag' ? changelogTagTarget(params?.tags) : null;
      return target ? original(target.name, target.params) : original(name, params);
    });
    app.routes['avocado-discussions'] = { path: '/discussions', component: AllDiscussionsPage };
    // Página "Salvos". Com o fof/bookmarks ativo a rota é dele (o FastRoute recusa
    // dois GET no mesmo path e derrubaria o boot, ver Support\BookmarksRoute); o
    // tema só troca o componente, para a lista sair em ThreadCard.
    app.routes[usesFofBookmarks() ? 'fof-bookmarks' : 'avocado-bookmarks'] = {
      path: BOOKMARKS_PATH,
      component: AvocadoBookmarksPage,
    };
    // No lugar do PostsPage do core (/posts?q=).
    app.routes['posts'] = { path: '/posts', component: AvocadoPostsSearchPage };
    app.routes['avocado-search'] = { path: '/search', component: AvocadoSearchPage };

    app.routes['tag'] = { path: '/t/:tags', component: AvocadoTagPage };
    // 'user.posts' tem o mesmo path de 'user' e o mapRoutes o processa depois,
    // sobrescrevendo 'user': troca os dois para o componente do tema valer em /u/:username.
    app.routes['user'] = { path: '/u/:username', component: AvocadoUserPostsPage };
    app.routes['user.posts'] = { path: '/u/:username', component: AvocadoUserPostsPage };
    app.routes['user.discussions'] = { path: '/u/:username/discussions', component: AvocadoUserDiscussionsPage };
    app.routes['user.likes'] = { path: '/u/:username/likes', component: AvocadoUserLikesPage };
    app.routes['user.mentions'] = { path: '/u/:username/mentions', component: AvocadoUserMentionsPage };

    // ── Theme class + logo override (needs app.forum — use beforeMount) ──────
    // O initialize() roda antes do pushPayload e de app.forum existir; o
    // beforeMount roda depois disso, antes do Mithril montar.
    app.beforeMount(() => {
      // Os chunks carregam só na navegação, sem preload: baixá-los no boot pesaria em
      // rotas que nunca os usam (home, /discussions, /tags).

      document.documentElement.classList.add('avocado-theme');

      // Classe para o CSS quando a extensão mobile-tab está ativa.
      if (app.extensions && app.extensions['android-com-pl/mobile-tab']) {
        document.documentElement.classList.add('has-mobile-tab');
      }

      // Logo SVG próprio. O PHP esconde o #home-link no <head> para o título não
      // piscar. Com o viewBox já medido o HideLogoFlash embute o SVG ainda no parse e
      // aqui só sobra conferir; no fallback (logo sem medida) busca, mede com getBBox
      // (common/logoViewBox) e insere.
      if (settingEnabled('avocadoLogoEnabled', false)) {
        const logoSvgPath = app.forum.attribute('avocadoLogoSvg');
        const homeLink = document.getElementById('home-link');
        const logoUrl = logoSvgPath ? resolveAssetUrl(logoSvgPath) : null;

        const restoreVisibility = () => {
          if (homeLink) homeLink.style.visibility = '';
          const hide = document.getElementById('avocado-logo-hide');
          if (hide) hide.remove();
        };

        if (homeLink && homeLink.querySelector('svg.AvocadoLogoSvg')) {
          restoreVisibility();
        } else if (homeLink && logoUrl) {
          fetch(logoUrl)
            .then((r) => (r.ok ? r.text() : Promise.reject()))
            .then((svgText) => {
              const parser = new DOMParser();
              const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
              const svgEl = svgDoc.documentElement;
              if (svgEl.nodeName !== 'svg') throw new Error('not-svg');

              const tightViewBox = measureTightViewBox(svgEl);

              const out = svgEl.cloneNode(true);
              if (tightViewBox) out.setAttribute('viewBox', tightViewBox);

              // Largura explícita para o SVG não colapsar em flex: altura fixa de 50px e
              // largura proporcional ao viewBox.
              const LOGO_H = 50;
              let logoW = LOGO_H; // sem viewBox: quadrado
              if (tightViewBox) {
                const vbParts = tightViewBox.split(' ');
                const vbW = parseFloat(vbParts[2]);
                const vbH = parseFloat(vbParts[3]);
                if (vbW > 0 && vbH > 0) logoW = Math.round((LOGO_H * vbW) / vbH);
              }
              out.setAttribute('width', String(logoW));
              out.setAttribute('height', String(LOGO_H));
              out.setAttribute('class', 'Header-logo AvocadoLogoSvg');
              out.setAttribute('role', 'img');
              out.setAttribute('aria-label', app.forum.attribute('title') || '');
              out.style.display = 'block';
              out.style.margin = '0 auto';

              homeLink.textContent = '';
              homeLink.style.display = 'flex';
              homeLink.style.alignItems = 'center';
              homeLink.style.justifyContent = 'center';
              homeLink.appendChild(out);
              restoreVisibility();
            })
            .catch(() => {
              // Fallback: <img> simples, sem o recorte do getBBox.
              const img = document.createElement('img');
              img.src = logoUrl;
              img.alt = app.forum.attribute('title') || '';
              img.className = 'Header-logo';
              homeLink.textContent = '';
              homeLink.appendChild(img);
              restoreVisibility();
            });
        } else {
          restoreVisibility();
        }
      } else {
        // Sem logo próprio, o PHP pode ter escondido o #home-link por causa do logo
        // padrão do Flarum: revela no load da <img>, que o Mithril cria depois do mount.
        const logoHide = document.getElementById('avocado-logo-hide');
        if (logoHide) {
          const homeLink = document.getElementById('home-link');
          const revealFn = () => {
            // Desliga o observador também no timeout, senão ele vigiaria o documento
            // inteiro para sempre quando a <img> não aparece.
            obs.disconnect();
            if (homeLink) homeLink.style.visibility = '';
            logoHide.remove();
          };
          // Rede de segurança: revela depois de 2,5 s mesmo sem load/error.
          const tid = setTimeout(revealFn, 2500);
          const obs = new MutationObserver(() => {
            const img = document.querySelector<HTMLImageElement>('#home-link img.Header-logo');
            if (!img) return;
            obs.disconnect();
            clearTimeout(tid);
            if (img.complete && img.naturalWidth > 0) {
              revealFn();
            } else {
              img.addEventListener('load', revealFn, { once: true });
              img.addEventListener('error', revealFn, { once: true });
            }
          });
          obs.observe(document.documentElement, { childList: true, subtree: true });
        }
      }
    });

    // ── Global Avatar override — person silhouette for users without a photo
    override(Avatar.prototype, 'view', function (original, vnode) {
      if (!settingEnabled('avocadoCustomDefaultAvatar', true)) return original(vnode);
      const user = this.attrs?.user;
      if (!user || user.avatarUrl?.()) return original(vnode);

      const extraClass = this.attrs.className ? ` ${this.attrs.className}` : '';
      return (
        <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" className={`Avatar AvocadoDefaultAvatar${extraClass}`} aria-hidden="true">
          <circle cx="64" cy="64" r="64" className="AvocadoDefaultAvatar-bg" />
          <circle cx="64" cy="46" r="18" className="AvocadoDefaultAvatar-fg" />
          <path d="M64 70C42 70 24 82 24 96V128H104V96C104 82 86 70 64 70Z" className="AvocadoDefaultAvatar-fg" />
        </svg>
      );
    });

    // ── UserPage (base for Security + Settings): Avocado layout ───────────
    // UserSecurityPage e SettingsPage são chunks; o override vai na base comum
    // (UserPage), que está no bundle principal.
    override(UserPage.prototype, 'view', function () {
      const user = this.user;
      const isEditable = user && (user.canEdit?.() || user === app.session.user);
      const controls = user ? UserControls.controls(user, this).toArray() : [];
      return (
        <div className="AvocadoUserPage">
          <div className="AvocadoNav-helper">{buildUserPhoneNav(this)}</div>
          {buildHero(user, isEditable, controls)}
          {buildSidebar(this)}
          <div className="AvocadoUserPage-body">
            <div className="AvocadoUserPage-bodyInner">
              {user ? this.content() : <div className="AvocadoHome-threadStack">{renderThreadSkeleton()}</div>}
            </div>
          </div>
        </div>
      );
    });

    // ── DiscussionHero: colored hero, white title, tag pills, state badges ────
    override(DiscussionHero.prototype, 'view', function (original, vnode) {
      const discussion = this.attrs.discussion;
      if (!discussion) return original(vnode);

      const tags = (discussion.tags?.() || []).filter(Boolean);
      const firstTag = tags[0] || null;
      const tagColor = firstTag?.color?.() || null;
      const color = tagColor || 'var(--primary-color)';

      // Imagem do hero opcional, enviada na criação quando a tag pede. Com ela o
      // overlay escurece o fundo para título e meta continuarem legíveis.
      const discHeroUrl = getDiscussionHeroImageUrl(discussion);

      // Os controles da imagem só aparecem com uma das tags na lista do admin e com
      // permissão de renomear (a mesma checagem do backend).
      const canManageHero = tagsRequireHeroImage(tags) && canEditDiscussionHero(discussion);

      // Evita disparar o upload duas vezes; fica na instância para sobreviver aos redraws.
      const startHeroUpload = () => {
        if ((this as any)._heroBusy) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          document.body.removeChild(input);
          if (!file) return;
          (this as any)._heroBusy = true;
          m.redraw();
          uploadDiscussionHeroImage(discussion.id(), file)
            .then((result) => {
              const attrs = (discussion as any).data?.attributes;
              if (attrs) {
                attrs.heroImagePath = result.heroImagePath;
                attrs.heroImageUrl = result.heroImageUrl;
              }
            })
            .catch(() => {
              try {
                app.alerts.show(
                  { type: 'error' },
                  trans('ramon-avocado.forum.home.composer_hero_image_upload_failed', 'Could not upload the hero image.')
                );
              } catch {
                /* noop */
              }
            })
            .finally(() => {
              (this as any)._heroBusy = false;
              m.redraw();
            });
        });
        input.click();
      };

      const removeHeroImage = () => {
        if ((this as any)._heroBusy) return;
        const ok = window.confirm(trans('ramon-avocado.forum.discussion.hero_image_remove_confirm', 'Remove the hero image from this discussion?'));
        if (!ok) return;
        (this as any)._heroBusy = true;
        m.redraw();
        deleteDiscussionHeroImage(discussion.id())
          .then(() => {
            const attrs = (discussion as any).data?.attributes;
            if (attrs) {
              attrs.heroImagePath = null;
              attrs.heroImageUrl = null;
            }
          })
          .catch(() => {
            /* mantém a imagem; o próximo render reflete o estado real */
          })
          .finally(() => {
            (this as any)._heroBusy = false;
            m.redraw();
          });
      };

      // Contraste do texto do hero pela luminância relativa (WCAG). Com imagem de
      // fundo o LESS põe um overlay escuro e o texto é sempre branco.
      const heroTextColor = discHeroUrl
        ? '#ffffff'
        : tagColor && tagColor.startsWith('#') && tagColor.replace('#', '').length === 6
          ? hexLuminance(tagColor) > 0.35
            ? '#202126'
            : '#ffffff'
          : '#ffffff';
      const heroTextMuted = heroTextColor === '#ffffff' ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.55)';
      const heroSurface = heroTextColor === '#ffffff' ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.10)';

      const title = discussion.title?.() || '';
      const replyCount = discussion.replyCount?.() || 0;
      const postCount = replyCount + 1;
      const views = discussionViews(discussion);

      // Avatares: autor e último a postar, O(1), sem percorrer o store.
      const participantMap = new Map();
      const author = discussion.user?.();
      if (author?.id?.()) participantMap.set(author.id(), author);
      const lastPoster = discussion.lastPostedUser?.();
      if (lastPoster?.id?.() && !participantMap.has(lastPoster.id())) {
        participantMap.set(lastPoster.id(), lastPoster);
      }
      const participants = Array.from(participantMap.values());

      // Participantes: o atributo da API e, sem ele, os ids únicos dos posts carregados.
      const apiCount = discussion.participantCount?.();
      const participantCount =
        typeof apiCount === 'number' && apiCount > 0
          ? apiCount
          : (() => {
              const ids = new Set();
              app.store.all('posts').forEach((p) => {
                if (p.discussion?.()?.id?.() === discussion.id?.()) {
                  const uid = p.user?.()?.id?.();
                  if (uid) ids.add(uid);
                }
              });
              return ids.size || participants.length;
            })();

      const MAX_PARTICIPANT_AVATARS = 6;
      const displayParticipants = participants.slice(0, MAX_PARTICIPANT_AVATARS);
      // Só autor e último a postar estão carregados: o "+N" usa o participantCount da
      // API, que é o total real.
      const extraParticipants =
        participantCount > displayParticipants.length
          ? participantCount - displayParticipants.length
          : participants.length > MAX_PARTICIPANT_AVATARS
            ? participants.length - MAX_PARTICIPANT_AVATARS
            : 0;

      const renderParticipantAvatar = (user) => {
        if (!user) return null;
        const username = user.username?.();
        return (
          <span key={user.id?.()} className="DiscussionHero-participantAvatar" title={username}>
            <Avatar user={user} />
          </span>
        );
      };

      const isSticky = discussion.isSticky?.();
      const isLocked = discussion.isLocked?.();
      const isHidden = !!discussion.hiddenAt?.();
      const subscription = discussion.subscription?.();

      // Ícones decorativos: os das tags filhas, na ordem original. Nenhum no celular
      // (≤480px); o segundo só no desktop (>767px), para o padding de dois ícones não
      // apertar o hero no tablet.
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 480;
      const isTwoIconScreen = typeof window !== 'undefined' && window.innerWidth > 767;
      const showDecorationIcon = !!app.forum.attribute('avocadoHeroDecorationIcon') && !isMobile;
      const decorationOpacity = app.forum.attribute('avocadoHeroDecorationIconOpacity');
      const opacityValue = decorationOpacity ? Math.min(Math.max(parseInt(decorationOpacity) / 100, 0), 1) : 0.15;
      let iconCount = parseInt(app.forum.attribute('avocadoHeroDecorationIconCount') || '1');

      const childTags = tags.filter((t) => t.parent?.());
      const firstChildTag = childTags[0] || null;
      const secondChildTag = iconCount >= 2 && isTwoIconScreen ? childTags[1] || null : null;

      const decorationIconClass = firstChildTag?.icon?.() || null;
      const decorationIconClass2 = secondChildTag?.icon?.() || null;
      const decorationTagColor = firstChildTag?.color?.() || null;
      const decorationTagColor2 = secondChildTag?.color?.() || null;
      const hasTwoDecoIcons = showDecorationIcon && isTwoIconScreen && iconCount >= 2 && !!decorationIconClass && !!decorationIconClass2;
      const showDecoDivider = hasTwoDecoIcons && !!app.forum.attribute('avocadoHeroDecoDivider');
      const decoDividerIcon = app.forum.attribute('avocadoHeroDecoDividerIcon') || 'fas fa-times';
      const decorationIconStyle = {
        ...(decorationOpacity ? { '--decoration-opacity': opacityValue } : {}),
      };

      const hasAnyDecoIcon = showDecorationIcon && !!decorationIconClass;
      const innerClass = [
        'DiscussionHero-inner',
        hasAnyDecoIcon ? 'has-deco-icon' : '',
        hasTwoDecoIcons ? 'has-two-deco-icons' : '',
        showDecoDivider ? 'has-deco-divider' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const heroClass = ['DiscussionHero', discHeroUrl ? 'DiscussionHero--withImage' : ''].filter(Boolean).join(' ');
      const heroStyle = {
        '--discussion-color': color,
        '--disc-hero-text': heroTextColor,
        '--disc-hero-text-muted': heroTextMuted,
        '--disc-hero-surface': heroSurface,
        ...(discHeroUrl ? { backgroundImage: safeCssUrl(discHeroUrl) } : {}),
      };

      const heroBusy = !!(this as any)._heroBusy;

      const imageControls = canManageHero ? (
        <div className="DiscussionHero-imageControls">
          {discHeroUrl ? (
            <>
              <button
                type="button"
                className="DiscussionHero-imageBtn"
                onclick={startHeroUpload}
                disabled={heroBusy}
                aria-label={trans('ramon-avocado.forum.discussion.hero_image_replace', 'Replace image')}
                title={trans('ramon-avocado.forum.discussion.hero_image_replace', 'Replace image')}
              >
                <i className={heroBusy ? 'fas fa-spinner fa-spin' : 'fas fa-camera'} aria-hidden="true" />
                <span>{trans('ramon-avocado.forum.discussion.hero_image_replace', 'Replace image')}</span>
              </button>
              <button
                type="button"
                className="DiscussionHero-imageBtn DiscussionHero-imageBtn--danger"
                onclick={removeHeroImage}
                disabled={heroBusy}
                aria-label={trans('ramon-avocado.forum.discussion.hero_image_remove', 'Remove image')}
                title={trans('ramon-avocado.forum.discussion.hero_image_remove', 'Remove image')}
              >
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="DiscussionHero-imageBtn"
              onclick={startHeroUpload}
              disabled={heroBusy}
              aria-label={trans('ramon-avocado.forum.discussion.hero_image_add', 'Add image')}
              title={trans('ramon-avocado.forum.discussion.hero_image_add', 'Add image')}
            >
              <i className={heroBusy ? 'fas fa-spinner fa-spin' : 'fas fa-camera'} aria-hidden="true" />
              <span>{trans('ramon-avocado.forum.discussion.hero_image_add', 'Add image')}</span>
            </button>
          )}
        </div>
      ) : null;

      // Uma versão do changelog não é uma discussão: tem cabeçalho próprio (ver
      // ReleaseHero), que também põe `avocado-release` no <html> enquanto existe.
      if (tagsAreChangelogProducts(tags)) return renderReleaseHero(discussion, tags, imageControls);

      return (
        <header className={heroClass} style={heroStyle}>
          <div className="container">
            <div className={innerClass} style={decorationIconStyle}>
              {imageControls}
              {(showDecorationIcon && decorationIconClass) ||
              (showDecorationIcon && showDecoDivider) ||
              (showDecorationIcon && isTwoIconScreen && iconCount >= 2 && decorationIconClass2) ? (
                <div className="DiscussionHero-decorationsContainer">
                  {showDecorationIcon && decorationIconClass && (
                    <div
                      className="DiscussionHero-decorationIcon is-visible"
                      style={decorationTagColor ? { '--tag-color-secondary': decorationTagColor } : {}}
                    >
                      <i className={decorationIconClass} aria-hidden="true" />
                    </div>
                  )}
                  {showDecorationIcon && showDecoDivider && (
                    <div className="DiscussionHero-decoSeparator" aria-hidden="true">
                      <i className={decoDividerIcon} />
                    </div>
                  )}
                  {showDecorationIcon && isTwoIconScreen && iconCount >= 2 && decorationIconClass2 && (
                    <div
                      className="DiscussionHero-decorationIcon DiscussionHero-decorationIcon--second is-visible"
                      style={decorationTagColor2 ? { '--tag-color-secondary': decorationTagColor2 } : {}}
                    >
                      <i className={decorationIconClass2} aria-hidden="true" />
                    </div>
                  )}
                </div>
              ) : null}
              <nav className="DiscussionHero-nav">
                <button
                  className="DiscussionHero-back"
                  onclick={() => {
                    if (window.history.length > 1) window.history.back();
                    else m.route.set(app.route('index'));
                  }}
                  aria-label={trans('ramon-avocado.forum.back', 'Back')}
                >
                  <i className="fas fa-arrow-left" aria-hidden="true" />
                </button>

                <div className="DiscussionHero-pills">
                  {isSticky && (
                    <Tooltip text={trans('flarum-sticky.forum.badge.sticky_tooltip', 'Pinned')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--sticky"
                        role="img"
                        aria-label={trans('flarum-sticky.forum.badge.sticky_tooltip', 'Pinned')}
                      >
                        <i className="fas fa-thumbtack" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {isLocked && (
                    <Tooltip text={trans('flarum-lock.forum.badge.locked_tooltip', 'Locked')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--locked"
                        role="img"
                        aria-label={trans('flarum-lock.forum.badge.locked_tooltip', 'Locked')}
                      >
                        <i className="fas fa-lock" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {isHidden && (
                    <Tooltip text={trans('core.forum.post.hidden_text', 'Hidden')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--hidden"
                        role="img"
                        aria-label={trans('core.forum.post.hidden_text', 'Hidden')}
                      >
                        <i className="fas fa-eye-slash" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {subscription === 'follow' && (
                    <Tooltip text={trans('flarum-subscriptions.forum.badge.following_tooltip', 'Following')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--following"
                        role="img"
                        aria-label={trans('flarum-subscriptions.forum.badge.following_tooltip', 'Following')}
                      >
                        <i className="fas fa-star" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {subscription === 'ignore' && (
                    <Tooltip text={trans('flarum-subscriptions.forum.badge.ignoring_tooltip', 'Ignoring')} position="bottom">
                      <span
                        className="AvocadoHome-badge AvocadoHome-badge--ignoring"
                        role="img"
                        aria-label={trans('flarum-subscriptions.forum.badge.ignoring_tooltip', 'Ignoring')}
                      >
                        <i className="fas fa-eye-slash" aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                  {tags.map((tag) => {
                    const tagColor = tag.color?.() || null;
                    const tagStyle = tagPillStyle(tagColor, 0.12);
                    return (
                      <a
                        key={tag.id()}
                        className="AvocadoHome-tagPill"
                        style={tagStyle}
                        href={app.route('tag', { tags: tag.slug() })}
                        onclick={(e) => {
                          e.preventDefault();
                          m.route.set(app.route('tag', { tags: tag.slug() }));
                        }}
                      >
                        {tag.icon() && <i className={tag.icon()} aria-hidden="true" />}
                        {tag.name()}
                      </a>
                    );
                  })}
                </div>
              </nav>

              <h1 className="DiscussionHero-title">{title}</h1>

              <div className="DiscussionHero-meta">
                {participants.length > 0 && (
                  <div className="DiscussionHero-participants">
                    {displayParticipants.map(renderParticipantAvatar)}
                    {extraParticipants > 0 && (
                      <span
                        className="DiscussionHero-participantsMore"
                        title={`${participantCount} ${trans('ramon-avocado.forum.discussion.participant_plural', 'participants')}`}
                      >
                        +{extraParticipants}
                      </span>
                    )}
                  </div>
                )}
                <span className="DiscussionHero-metaItem">
                  <i className="far fa-comment" aria-hidden="true" />
                  {postCount}{' '}
                  {postCount === 1
                    ? trans('ramon-avocado.forum.discussion.post_singular', 'post')
                    : trans('ramon-avocado.forum.discussion.post_plural', 'posts')}
                </span>
                {participantCount > 0 && (
                  <span className="DiscussionHero-metaItem">
                    <i className="fas fa-users" aria-hidden="true" />
                    {participantCount}{' '}
                    {participantCount === 1
                      ? trans('ramon-avocado.forum.discussion.participant_singular', 'participant')
                      : trans('ramon-avocado.forum.discussion.participant_plural', 'participants')}
                  </span>
                )}
                {/* michaelbelgium/flarum-discussion-views */}
                {views !== null && (
                  <span className="DiscussionHero-metaItem">
                    <i className="far fa-eye" aria-hidden="true" />
                    {formatViews(views)}{' '}
                    {views === 1
                      ? trans('ramon-avocado.forum.discussion.view_singular', 'view')
                      : trans('ramon-avocado.forum.discussion.view_plural', 'views')}
                  </span>
                )}
                <WhoIsReading discussion={discussion} />
              </div>
            </div>
          </div>
        </header>
      );
    });

    // ── DiscussionPage skeleton override ───────────────────────────────────
    override(DiscussionPage.prototype, 'view', function (original, vnode) {
      if (this.discussion) return original(vnode);

      // Ícones decorativos do skeleton com as mesmas regras do hero real, pela
      // discussão em cache (vindo da lista); sem cache, um ícone genérico.
      const _routeId = String(m.route.param('id') ?? '');
      const _numericId = _routeId && !isNaN(parseInt(_routeId)) ? String(parseInt(_routeId)) : null;
      const _cachedDisc = _numericId ? app.store.getById('discussions', _numericId) : null;

      const _skelMobile = typeof window !== 'undefined' && window.innerWidth <= 480;
      const _skelTwoScreen = typeof window !== 'undefined' && window.innerWidth > 1129;
      const _skelShowDeco = !!app.forum.attribute('avocadoHeroDecorationIcon') && !_skelMobile;
      const _skelIconCount = parseInt(app.forum.attribute('avocadoHeroDecorationIconCount') || '1');

      let _skelHasFirstIcon = false;
      let _skelHasSecondIcon = false;
      let _skelFirstIconCls: string | null = null;
      let _skelSecondIconCls: string | null = null;
      if (_skelShowDeco) {
        if (_cachedDisc) {
          const _skelAllTags = (_cachedDisc.tags?.() || []).filter(Boolean);
          const _skelChildTags = _skelAllTags.filter((t) => t.parent?.());
          _skelHasFirstIcon = !!_skelChildTags[0];
          _skelHasSecondIcon = _skelTwoScreen && _skelIconCount >= 2 && !!_skelChildTags[1];
          _skelFirstIconCls = _skelChildTags[0]?.icon?.() || null;
          _skelSecondIconCls = _skelHasSecondIcon ? _skelChildTags[1]?.icon?.() || null : null;
        } else {
          _skelHasFirstIcon = true;
        }
      }

      const _skelHasTwo = _skelHasFirstIcon && _skelHasSecondIcon;
      const _skelHasDivider = _skelHasTwo && !!app.forum.attribute('avocadoHeroDecoDivider');

      // Versão do changelog: vindo da lista, a discussão já está no store com o que o
      // cabeçalho mostra. O skeleton usa o próprio ReleaseHero, sem os botões de
      // edição, para a página não trocar de cara ao terminar de carregar.
      const _skelTags = _cachedDisc ? (_cachedDisc.tags?.() || []).filter(Boolean) : [];
      const _skelRelease = !!_cachedDisc && tagsAreChangelogProducts(_skelTags);
      // Uma versão quase sempre é só as notas: nada de três posts-fantasma para uma.
      const _skelPosts = _skelRelease ? Math.min(3, 1 + (_cachedDisc.replyCount?.() || 0)) : 3;

      return (
        <div className="Page DiscussionPage DiscussionPage--skeleton">
          <div className="Page-main">
            {_skelRelease ? (
              // Embrulhado: o cabeçalho tem `key` (é o que faz o Mithril recriá-lo ao trocar
              // de hero) e não pode ser irmão direto de vnodes sem key.
              <div className="AvocadoSkeleton-releaseHero">{renderReleaseHero(_cachedDisc, _skelTags, null, true)}</div>
            ) : (
              <div className="AvocadoSkeleton-discussionHero">
                <div className="container">
                  <div className="AvocadoSkeleton-heroInner">
                    <div className="AvocadoSkeleton-nav">
                      <div className="AvocadoSkeleton-backBtn" />
                      <div className="AvocadoSkeleton-tag" />
                      <div className="AvocadoSkeleton-tag" style="width:56px" />
                    </div>
                    <div className="AvocadoSkeleton-title" />
                    <div className="AvocadoSkeleton-meta">
                      <div className="AvocadoSkeleton-avatarStack">
                        <div className="AvocadoSkeleton-stackItem" />
                        <div className="AvocadoSkeleton-stackItem" />
                        <div className="AvocadoSkeleton-stackItem" />
                        <div className="AvocadoSkeleton-stackItem AvocadoSkeleton-stackItem--more" />
                      </div>
                      <div className="AvocadoSkeleton-metaChip AvocadoSkeleton-metaChip--md" />
                      <div className="AvocadoSkeleton-metaChip AvocadoSkeleton-metaChip--sm" />
                    </div>
                    {_skelShowDeco && _skelHasFirstIcon && (
                      <div className={`AvocadoSkeleton-decoContainer${_skelHasTwo ? ' is-two' : ''}${_skelHasDivider ? ' has-divider' : ''}`}>
                        <div className={`AvocadoSkeleton-decoIcon${_skelFirstIconCls ? ' AvocadoSkeleton-decoIcon--icon' : ''}`}>
                          {_skelFirstIconCls && <i className={_skelFirstIconCls} aria-hidden="true" />}
                        </div>
                        {_skelHasDivider && (
                          <div className="AvocadoSkeleton-decoSep" aria-hidden="true">
                            <i className={app.forum.attribute('avocadoHeroDecoDividerIcon') || 'fas fa-times'} />
                          </div>
                        )}
                        {_skelHasTwo && (
                          <div className={`AvocadoSkeleton-decoIcon${_skelSecondIconCls ? ' AvocadoSkeleton-decoIcon--icon' : ''}`}>
                            {_skelSecondIconCls && <i className={_skelSecondIconCls} aria-hidden="true" />}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="Page-container container">
              {/* Sidebar primeiro, como no containerItems() do Flarum: com row-reverse o
                  primeiro filho fica à direita. */}
              {renderDiscussionNavSkeleton(!!app.session.user)}
              <div className="Page-content">
                <div className="AvocadoSkeleton-stream">
                  {[0, 1, 2].slice(0, _skelPosts).map((i) => (
                    <div key={String(i)} className="AvocadoSkeleton-post">
                      <div className="AvocadoSkeleton-postAvatar" />
                      <div className="AvocadoSkeleton-postBody">
                        <div className="AvocadoSkeleton-line AvocadoSkeleton-line--sm AvocadoSkeleton-line--user" />
                        <div className="AvocadoSkeleton-postHeader">
                          <div className="AvocadoSkeleton-postAvatarSm" />
                          <div className="AvocadoSkeleton-line AvocadoSkeleton-line--sm" />
                        </div>
                        <div className="AvocadoSkeleton-line AvocadoSkeleton-line--lg" />
                        <div className="AvocadoSkeleton-line AvocadoSkeleton-line--md" />
                        <div className="AvocadoSkeleton-line AvocadoSkeleton-line--sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    });

    // ── Auth modal panel injection via Mithril content() override ─────────────
    // No Flarum 2 esses modais são chunks e o import estático resolve undefined. O
    // import dinâmico começa no init para os overrides valerem antes do clique em "Entrar".
    const authPanelOverride = (iconCls) =>
      function authContent(original) {
        // O admin pode voltar ao modal padrão do Flarum.
        if (!settingEnabled('avocadoCustomAuthModal', true)) return original();

        const rawUrl = app.forum?.attribute('avocadoAuthImage') || app.forum?.attribute('avocadoHeroImage') || null;
        const heroUrl = rawUrl ? resolveAssetUrl(rawUrl) : null;
        return (
          <>
            <div className="AvocadoAuth-formIcon">
              <i className={iconCls} aria-hidden="true" />
            </div>
            <div
              className="AvocadoAuth-panel"
              style={heroUrl ? { backgroundImage: safeCssUrl(heroUrl), backgroundSize: 'cover', backgroundPosition: 'center top' } : {}}
              oncreate={(vnode) => {
                // O :has() do CSS pode perder para o max-width inline do Flarum no .Modal-dialog:
                // setProperty com 'important' vence. Vale também para .Modal, porque a estrutura
                // varia entre builds do 2.x.
                if (window.innerWidth >= 768) {
                  const targets = [vnode.dom.closest?.('.Modal-dialog'), vnode.dom.closest?.('.Modal')].filter(Boolean);
                  targets.forEach((el) => {
                    el.style.setProperty('max-width', '860px', 'important');
                    el.style.setProperty('width', '92vw', 'important');
                  });
                }
              }}
            >
              <div className="AvocadoAuth-panelOverlay" />
            </div>
            {original()}
          </>
        );
      };

    // O chunkUrl precisa de app.forum.attribute('assetsUrl'), e app.forum só existe
    // depois dos initializers: o setTimeout(0) adia os imports para depois do boot().
    setTimeout(() => {
      Promise.all([
        flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal'),
        flarum.reg.asyncModuleImport('flarum/forum/components/SignUpModal'),
        flarum.reg.asyncModuleImport('flarum/forum/components/ForgotPasswordModal'),
      ])
        .then(([LogInModal, SignUpModal, ForgotPasswordModal]) => {
          if (LogInModal.prototype.__avocadoPanelPatched) return;
          override(LogInModal.prototype, 'content', authPanelOverride('fas fa-lock'));
          override(SignUpModal.prototype, 'content', authPanelOverride('fas fa-user-plus'));
          override(ForgotPasswordModal.prototype, 'content', authPanelOverride('fas fa-envelope'));
          LogInModal.prototype.__avocadoPanelPatched = true;
        })
        .catch(() => {}); // sem os chunks, não faz nada
    }, 0);

    // ── HeaderSecondary auth buttons for guest users ──────────────────────
    extend(HeaderSecondary.prototype, 'items', function (items) {
      if (!settingEnabled('avocadoShowAuthButtons', false) || app.session.user) return;

      // O ItemList do Flarum 2 usa setContent(); replace() não existe. Chaves: 'signUp'
      // (com U maiúsculo) e 'logIn'.
      if (items.has('signUp')) {
        items.setContent(
          'signUp',
          <button
            className="Button AvocadoHeader-authBtn AvocadoHeader-authBtn--signup"
            onclick={() => app.modal.show(() => flarum.reg.asyncModuleImport('flarum/forum/components/SignUpModal'))}
          >
            <i className="fas fa-user-plus" aria-hidden="true" />
            {app.translator.trans('core.forum.header.sign_up_link')}
          </button>
        );
      }

      if (items.has('logIn')) {
        items.setContent(
          'logIn',
          <button
            className="Button AvocadoHeader-authBtn AvocadoHeader-authBtn--login"
            onclick={() => app.modal.show(() => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal'))}
          >
            <i className="fas fa-sign-in-alt" aria-hidden="true" />
            {app.translator.trans('core.forum.header.log_in_link')}
          </button>
        );
      }

      if (items.has('logIn') && items.has('signUp')) {
        items.add('avocadoAuthSep', <span className="AvocadoHeader-authSep">{trans('ramon-avocado.forum.header.or', 'or')}</span>, 5);
      }
    });

    // ── IndexPage-newDiscussion: aria-label ───────────────────────────────────
    // No celular o core desenha o botão só com ícone, sem nome acessível.
    extend(IndexPage.prototype, 'oncreate', function () {
      const btn = this.element?.querySelector('.IndexPage-newDiscussion');
      if (btn && !btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', app.translator.trans('core.forum.index.start_discussion_button'));
      }
    });
    extend(IndexPage.prototype, 'onupdate', function () {
      const btn = this.element?.querySelector('.IndexPage-newDiscussion');
      if (btn && !btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', app.translator.trans('core.forum.index.start_discussion_button'));
      }
    });

    // ── IndexPage oninit: redirect /?q=… to /search?q=… once per mount ──────
    // No oninit (uma vez por montagem), não no contentItems (a cada redraw), para não
    // acumular m.route.set e entrar em loop. Pula quando se volta de uma página de
    // busca, para o "voltar" cair no IndexPage filtrado em vez de voltar à busca.
    extend(IndexPage.prototype, 'oninit', function () {
      if (!customHomeEnabled() && hasSearchQuery()) {
        const prevRoute = app.previous?.get?.('routeName');
        if (prevRoute === 'avocado-search' || prevRoute === 'posts') return;
        const params = app.search?.state?.params?.() || {};
        m.route.set(app.route('avocado-search', params), null, { replace: true });
      }
    });

    // ── DiscussionComposer (modal flow used by TagPage) ────────────────────
    // O componente vem num chunk: o import estático é undefined no boot, e o
    // asyncModuleImport falharia porque app.forum ainda não existe. O
    // flarum.reg.onLoad espera o chunk carregar sozinho e então aplica o patch.
    // Com uma das tags em `avocadoHeroImageTags`, ganha o campo de imagem do hero,
    // enviada para /api/avocado/discussion-hero depois de criar a discussão.
    flarum.reg.onLoad('core', 'forum/components/DiscussionComposer', (DiscussionComposer) => {
      extend(DiscussionComposer.prototype, 'oninit', function () {
        this._avocadoHeroFile = null;
        this._avocadoHeroPreview = null;
        // Um rascunho do fof/drafts aberto aqui traz versão e capa nos attrs (o `extra` do rascunho).
        this._avocadoVersion = this.attrs.changelogVersion || '';
        this._avocadoCover = this.attrs.changelogCover ?? 'color';
        // Rótulos que o core define em initAttrs: guardados para voltar a eles
        // quando a tag escolhida deixa de ser um produto do changelog.
        this._avocadoLabels = {
          title: this.attrs.titlePlaceholder,
          body: this.attrs.placeholder,
          submit: this.attrs.submitLabel,
        };
      });

      // Com um produto do changelog escolhido o que se escreve é uma versão, não
      // uma discussão: título do compositor, placeholders e botão dizem isso.
      override(DiscussionComposer.prototype, 'view', function (original, vnode) {
        const labels = this._avocadoLabels;
        if (labels) {
          const release = tagsAreChangelogProducts(this.composer?.fields?.tags || []);
          this.attrs.titlePlaceholder = release ? trans('ramon-avocado.forum.changelog.composer_title_placeholder', 'Release title…') : labels.title;
          this.attrs.placeholder = release
            ? trans('ramon-avocado.forum.changelog.composer_body_placeholder', 'Write the release notes…')
            : labels.body;
          // O core guarda o texto já traduzido (extractText): a chave apareceria crua no botão.
          this.attrs.submitLabel = release ? trans('ramon-avocado.forum.changelog.composer_submit', 'Publish release') : labels.submit;
        }
        return original(vnode);
      });

      extend(DiscussionComposer.prototype, 'onremove', function () {
        if (this._avocadoHeroPreview) {
          try {
            URL.revokeObjectURL(this._avocadoHeroPreview);
          } catch {
            /* noop */
          }
          this._avocadoHeroPreview = null;
        }
      });

      extend(DiscussionComposer.prototype, 'headerItems', function (items) {
        const tags = this.composer?.fields?.tags || [];
        if (tagsAreChangelogProducts(tags)) {
          // ItemList do Flarum 2 não tem `replace`: setContent troca só o conteúdo e mantém a prioridade.
          items.setContent('title', <h3>{trans('ramon-avocado.forum.changelog.composer_title', 'New release')}</h3>);
        }
        if (!tagsRequireHeroImage(tags)) return;

        const setFile = (file) => {
          if (this._avocadoHeroPreview) {
            try {
              URL.revokeObjectURL(this._avocadoHeroPreview);
            } catch {
              /* noop */
            }
          }
          this._avocadoHeroFile = file || null;
          this._avocadoHeroPreview = file ? URL.createObjectURL(file) : null;
          m.redraw();
        };

        const previewUrl = this._avocadoHeroPreview;
        const file = this._avocadoHeroFile;

        // Um chip de 32px que cabe no cabeçalho do compositor sem mexer no layout.
        const chip = previewUrl ? (
          <span className="AvocadoHome-composerHeroChip is-set" title={file?.name || ''}>
            <span
              className="AvocadoHome-composerHeroChip-thumb"
              style={{ backgroundImage: `url(${JSON.stringify(previewUrl)})` }}
              aria-hidden="true"
            />
            <span className="AvocadoHome-composerHeroChip-label">
              {file?.name || trans('ramon-avocado.forum.home.composer_hero_image_picked', 'Image selected')}
            </span>
            <button
              type="button"
              className="AvocadoHome-composerHeroChip-remove"
              onclick={() => setFile(null)}
              aria-label={trans('ramon-avocado.forum.home.composer_hero_image_remove', 'Remove image')}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </span>
        ) : (
          <label className="AvocadoHome-composerHeroChip">
            <input
              type="file"
              accept="image/*"
              onchange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.type.startsWith('image/')) setFile(f);
                e.target.value = '';
              }}
            />
            <i className="fas fa-image" aria-hidden="true" />
            <span>{trans('ramon-avocado.forum.home.composer_hero_image_label', 'Hero image (optional)')}</span>
          </label>
        );

        // Versão e capa na cor da tag: mesma linha do chip de imagem, só quando
        // uma das tags escolhidas é um produto do changelog.
        const changelog = tagsAreChangelogProducts(tags)
          ? changelogChips({
              tags,
              version: this._avocadoVersion || '',
              onVersion: (value) => (this._avocadoVersion = value),
              cover: this._avocadoCover ?? null,
              onCover: (value) => (this._avocadoCover = value),
              hasImage: !!previewUrl,
            })
          : [];

        items.add(
          'avocadoHeroImage',
          <div className="AvocadoHome-composerHeroChipRow AvocadoHome-composerHeroChipRow--modal">
            {chip}
            {changelog}
          </div>,
          50 // entre 'title' (100) e o editor
        );
      });

      // A versão e o tipo de capa viajam com a própria discussão (atributos do
      // DiscussionResource, ver Api\ChangelogFields); a imagem segue pelo upload.
      extend(DiscussionComposer.prototype, 'data', function (data) {
        const tags = this.composer?.fields?.tags || [];
        if (!tagsAreChangelogProducts(tags)) return;
        Object.assign(data, changelogAttributes(this._avocadoVersion || '', this._avocadoCover ?? null, !!this._avocadoHeroFile));
      });

      override(DiscussionComposer.prototype, 'onsubmit', function (original) {
        const file = this._avocadoHeroFile;
        // Sem imagem: o fluxo original, sem mudanças.
        if (!file) {
          return original();
        }

        // O fluxo do core, mas o sucesso envia a imagem antes de navegar para a discussão.
        this.loading = true;
        const data = this.data();

        app.store
          .createRecord('discussions')
          .save(data)
          .then(async (discussion) => {
            try {
              const result = await uploadDiscussionHeroImage(discussion.id(), file);
              const attrs = discussion.data?.attributes;
              if (attrs) {
                attrs.heroImagePath = result.heroImagePath;
                attrs.heroImageUrl = result.heroImageUrl;
              }
            } catch (_err) {
              try {
                app.alerts.show(
                  { type: 'error' },
                  trans(
                    'ramon-avocado.forum.home.composer_hero_image_upload_failed',
                    'Could not upload the hero image. You can try again on the discussion page.'
                  )
                );
              } catch {
                /* alertas podem não existir */
              }
            }
            this.composer.hide();
            app.discussions?.refresh?.();
            m.route.set(app.route.discussion(discussion));
          }, this.loaded.bind(this));
      });
    });

    // ── RenameDiscussionModal: versão e capa de uma entrada do changelog ────
    // Editar depois de publicar: quem pode renomear a discussão também acerta o
    // número da versão e escolhe entre imagem e banner na cor da tag (a imagem
    // em si é trocada nos controles do cabeçalho da discussão). Carregado sob
    // demanda como o DiscussionComposer, então o patch espera o módulo existir.
    flarum.reg.onLoad('core', 'forum/components/RenameDiscussionModal', (RenameDiscussionModal) => {
      extend(RenameDiscussionModal.prototype, 'oninit', function () {
        this._avocadoVersion = this.discussion.attribute?.('changelogVersion') || '';
        this._avocadoCover = this.discussion.attribute?.('changelogCover') || null;
      });

      override(RenameDiscussionModal.prototype, 'title', function (original) {
        return tagsAreChangelogProducts(this.discussion?.tags?.() || [])
          ? trans('ramon-avocado.forum.changelog.edit_release', 'Edit release')
          : original();
      });

      override(RenameDiscussionModal.prototype, 'content', function (original) {
        const vnode = original();
        const discussion = this.discussion;
        if (!tagsAreChangelogProducts(discussion.tags?.() || [])) return vnode;

        const groups = vnode?.children?.[0]?.children;
        if (!Array.isArray(groups)) return vnode;

        const hasImage = !!getDiscussionHeroImageUrl(discussion);
        groups.splice(
          1,
          0,
          <div className="Form-group AvocadoChangelogField-modal">
            <div className="AvocadoHome-composerHeroChipRow">
              {changelogChips({
                tags: discussion.tags?.() || [],
                version: this._avocadoVersion || '',
                onVersion: (value) => (this._avocadoVersion = value),
                cover: this._avocadoCover ?? null,
                onCover: (value) => (this._avocadoCover = value),
                hasImage,
              })}
            </div>
          </div>
        );

        return vnode;
      });

      override(RenameDiscussionModal.prototype, 'onsubmit', function (original, e) {
        const discussion = this.discussion;
        if (!tagsAreChangelogProducts(discussion.tags?.() || [])) return original(e);

        const version = (this._avocadoVersion || '').trim();
        const savedVersion = discussion.attribute?.('changelogVersion') || '';
        const savedCover = discussion.attribute?.('changelogCover') || null;
        // Com imagem de capa o seletor de cor não aparece: o valor guardado fica como está.
        const cover = getDiscussionHeroImageUrl(discussion) ? savedCover : (this._avocadoCover ?? null);

        // Nada mudou no changelog: o fluxo de renomear do core segue como está.
        if (version === savedVersion && cover === savedCover) return original(e);

        e.preventDefault();
        this.loading = true;

        const attrs: Record<string, unknown> = { changelogVersion: version || null, changelogCover: cover };
        const title = this.newTitle();
        if (title && title !== this.currentTitle) attrs.title = title;

        return discussion
          .save(attrs)
          .then(() => {
            // Renomear cria um post de evento na discussão: atualiza o stream se ela está aberta.
            if (attrs.title && app.viewingDiscussion(discussion)) {
              app.current
                .get('stream')
                .update()
                .then(() => m.redraw());
            } else {
              m.redraw();
            }
            this.hide();
          })
          .catch(() => {
            this.loading = false;
            m.redraw();
          });
      });
    });

    // ── IndexPage contentItems: swap to HomePage ──────────────────────────
    extend(IndexPage.prototype, 'contentItems', function (items) {
      if (customHomeEnabled()) {
        items.remove('discussionList');
        items.remove('toolbar');
        items.add('avocadoHome', <HomePage />, 100);
      }
    });

    // ── IndexPage view: setClassName for avocadoHome / avocadoSearch ──────
    extend(IndexPage.prototype, 'view', function (vdom) {
      if (!vdom) return;
      // IndexPage--avocadoRoot marca o IndexPage de verdade, para os guardas do
      // PageStructure o distinguirem de páginas de extensão que também levam
      // 'IndexPage' na classe (ex.: LeaderboardPage).
      setClassName(vdom, 'IndexPage--avocadoRoot', true);
      setClassName(vdom, 'IndexPage--avocadoHome', customHomeEnabled());
      setClassName(vdom, 'IndexPage--avocadoSearch', false);
    });

    // ── IndexSidebar preload + items + navItems ────────────────────────────
    if (app.tagList?.load) {
      app.tagList.load(['children', 'parent']).catch(() => {});
    }

    // ── PageStructure: replace sidebar + strip hero for non-Discussion pages ──────
    // sidebar() vira sempre o AvocadoNav-helper: no celular com altura 0 (os
    // controles escapam para o cabeçalho por position:absolute), no tablet+
    // display:none. mainItems() tira o 'hero' das páginas de extensão.
    override(PageStructure.prototype, 'sidebar', function (original) {
      if (this.attrs.className?.includes('DiscussionPage')) return original();
      // As páginas do linkrobins/support trazem na sidebar os próprios controles
      // ("Novo ticket", filtros de status). Ela volta em providedContent() como barra
      // horizontal: trocada pelo nav do tema, não haveria como abrir um ticket.
      if (isSupportPage(this.attrs.className)) return null;
      // O índice do linkrobins/wiki, pelo mesmo motivo: o botão "Novo artigo" e
      // as categorias moram na sidebar dele (ver utils/wiki.tsx).
      if (isWikiIndexPage(this.attrs.className)) return null;
      return (
        <div className="AvocadoNav-helper">
          <IndexSidebar key={m.route.get()} />
        </div>
      );
    });

    // ── PageStructure hero suppression + extension page header ─────────────────
    // Página de extensão é tudo que não é DiscussionPage nem o IndexPage de verdade
    // (marcado com 'IndexPage--avocadoRoot').
    const isExtensionPage = (cls) => !cls.includes('DiscussionPage') && !cls.includes('IndexPage--avocadoRoot');
    // A página de um ticket do linkrobins/support traz o próprio hero (o mesmo
    // da discussão, montado em utils/support.tsx) e por isso fica de fora das
    // duas camadas que apagam o hero das demais páginas de extensão.
    const keepsOwnHero = (cls) => isSupportTicketPage(cls);

    // Camada 1: tira o item 'hero' do layout.
    extend(PageStructure.prototype, 'mainItems', function (items) {
      const cls = this.attrs.className || '';
      if (isExtensionPage(cls) && !keepsOwnHero(cls)) items.remove('hero');
    });

    // Camada 2: providedHero() devolve null, para o 'hero' não renderizar nem quando
    // outra extensão o põe de volta depois de nós.
    override(PageStructure.prototype, 'providedHero', function (original) {
      const cls = this.attrs.className || '';
      if (isExtensionPage(cls) && !keepsOwnHero(cls)) return null;
      return original();
    });

    // Cabeçalho das páginas de extensão no lugar do hero: título e link para a home,
    // no topo de .Page-content. app.title vem do app.setTitle() de cada página.
    override(PageStructure.prototype, 'providedContent', function (original) {
      const cls = this.attrs.className || '';
      if (!isExtensionPage(cls)) return original();
      // O título e o "voltar" de um ticket já estão no hero dele.
      // As páginas do linkrobins/wiki trazem o próprio <h1> (no artigo ele é o
      // hero), então ficam sem o cabeçalho do tema; o índice ganha a barra.
      if (isWikiPage(cls)) {
        return (
          <div className="Page-content" id="main-content">
            {wikiToolbar(this)}
            {this.content}
          </div>
        );
      }
      if (keepsOwnHero(cls)) {
        return (
          <div className="Page-content" id="main-content">
            {supportToolbar(this)}
            {this.content}
          </div>
        );
      }
      return (
        <div className="Page-content" id="main-content">
          <div className="AvocadoExtensionPage-header">
            {app.title ? <h1 className="AvocadoExtensionPage-title">{app.title}</h1> : null}
            <a
              className="AvocadoExtensionPage-homeLink"
              href={app.route('index')}
              onclick={(e) => {
                e.preventDefault();
                m.route.set(app.route('index'));
              }}
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
              {trans('ramon-avocado.forum.header.back_home', 'Back to Home')}
            </a>
          </div>
          {supportToolbar(this)}
          {this.content}
        </div>
      );
    });

    // Mantém as classes IndexPage-nav/sideNav do Flarum para o CSS do core (expandir
    // o nav, posição no celular) continuar valendo; AvocadoExtensionNav fica junto
    // para os seletores do HomePage.less. A className do vnode é preservada como no
    // core: subclasses do IndexSidebar (ex.: SupportIndexSidebar do
    // linkrobins/support) herdam esta view e acham a própria nav por ela.
    override(IndexSidebar.prototype, 'view', function () {
      return (
        <nav className={classList('IndexPage-nav sideNav AvocadoExtensionNav', this.attrs.className)}>
          <ul>{listItems(this.items().toArray())}</ul>
        </nav>
      );
    });

    extend(IndexSidebar.prototype, 'items', function (items) {
      const nav = items.get('nav');
      if (nav?.attrs) {
        nav.attrs.defaultLabel = app.translator.trans('core.forum.index.all_discussions_link');
        nav.attrs.lazyDraw = false;
      }
    });

    extend(IndexSidebar.prototype, 'navItems', function (items) {
      if (items.has('loading')) {
        items.remove('loading');
      }

      // "Discussões populares" primeiro: leva à home do tema.
      if (!items.has('popularHome') && customHomeEnabled()) {
        items.add(
          'popularHome',
          <LinkButton href={app.route('index')} icon="fas fa-home">
            {trans('ramon-avocado.forum.home.popular_heading', 'Popular discussions')}
          </LinkButton>,
          110
        );
      }

      // "Todas as discussões" aponta para a página do tema em vez do index.
      if (items.has('allDiscussions')) {
        items.remove('allDiscussions');
        items.add(
          'allDiscussions',
          <LinkButton href={app.route('avocado-discussions')} icon="far fa-comments">
            {app.translator.trans('core.forum.index.all_discussions_link')}
          </LinkButton>,
          100
        );
      }

      // "Buscar": aparece no menu do celular e dá o título do cabeçalho em /search.
      if (!items.has('avocadoSearch')) {
        items.add(
          'avocadoSearch',
          <LinkButton href={app.route('avocado-search')} icon="fas fa-search">
            {trans('ramon-avocado.forum.header.search', 'Search')}
          </LinkButton>,
          95
        );
      }

      // "Salvos", só para quem está logado (guest não salva). Com o fof/bookmarks ativo
      // quem põe o item é ele (addBookmarksNavItem).
      if (app.session.user && avocadoBookmarksEnabled() && !items.has('avocadoBookmarks')) {
        items.add(
          'avocadoBookmarks',
          <LinkButton href={app.route('avocado-bookmarks')} icon="fas fa-bookmark">
            {trans('ramon-avocado.forum.bookmarks.title', 'Saved')}
          </LinkButton>,
          93
        );
      }

      if (!items.has('avocadoChangelog') && app.forum?.attribute('avocadoChangelogEnabled')) {
        items.add(
          'avocadoChangelog',
          <LinkButton href={app.route('avocado-changelog')} icon="fas fa-rocket">
            {app.forum.attribute('avocadoChangelogTitle') || trans('ramon-avocado.forum.changelog.title', 'Changelog')}
          </LinkButton>,
          91
        );
      }

      if (!items.has('avocadoTeam') && app.forum?.attribute('avocadoTeamPageEnabled')) {
        const teamTitle = app.forum.attribute('avocadoTeamPageTitle') || trans('ramon-avocado.forum.team.title', 'Our Team');
        items.add(
          'avocadoTeam',
          <LinkButton href={app.route('avocado-team')} icon="fas fa-users">
            {teamTitle}
          </LinkButton>,
          90
        );
      }
    });

    // ── Bookmark action in discussion controls ────────────────────────────
    // "Salvar" nos controles de toda discussão: cobre o cabeçalho da página e os
    // dropdowns dos cards num ponto só. Prioridade abaixo do Responder (0), para o
    // SplitDropdown manter "Responder" como botão principal. Com o fof/bookmarks
    // ativo o item é o dele (addDiscussionControls).
    extend(DiscussionControls, 'userControls', function (items: any, discussion: any) {
      if (!app.session.user || !avocadoBookmarksEnabled()) return;

      const saved = isBookmarked(discussion);
      items.add(
        'avocadoBookmark',
        <Button icon={saved ? 'fas fa-bookmark' : 'far fa-bookmark'} onclick={() => toggleBookmark(discussion)}>
          {saved ? trans('ramon-avocado.forum.bookmarks.unsave', 'Remove from saved') : trans('ramon-avocado.forum.bookmarks.save', 'Save')}
        </Button>,
        -10
      );

      // Nota/lembrete do bookmark — só faz sentido quando já está salvo.
      // BookmarkModal é o loader lazy (chunk); o ModalManager do core aceita a função async.
      if (saved) {
        items.add(
          'avocadoBookmarkEdit',
          <Button icon="far fa-clock" onclick={() => app.modal.show(BookmarkModal, { discussion })}>
            {trans('ramon-avocado.forum.bookmarks.edit', 'Edit bookmark')}
          </Button>,
          -11
        );
      }
    });

    // ── Bookmark de post no menu ⋯ (fof/bookmarks) ───────────────────
    // O Flarum 2 põe esse tipo de ação no dropdown do post. Com 'header'/'actions'
    // escolhido na extensão, o CSS esconde o botão dela (remover do ItemList seria
    // uma corrida: a ordem dos initializers entre extensões não é garantida) e o
    // item abaixo entra no lugar. Com 'menu' a extensão já põe o dela.
    extend(PostControls, 'userControls', function (items: any, post: any) {
      if (!app.session.user || !usesFofBookmarks() || fofPostButtonInMenu()) return;

      const marked = !!post?.attribute?.('bookmarked');

      items.add(
        'avocadoBookmark',
        <Button
          icon={marked ? 'fas fa-bookmark' : 'far fa-bookmark'}
          onclick={() => {
            post.save({ bookmarked: !marked }).catch(() => {
              app.alerts.show(
                { type: 'error' },
                trans('ramon-avocado.forum.bookmarks.toggle_error', 'Could not update your saved list. Please try again.')
              );
            });
          }}
        >
          {fofTrans(`postButton.${marked ? 'remove' : 'add'}`, marked ? 'Bookmarked' : 'Bookmark')}
        </Button>
      );
    });

    // ── Bookmark reminder notification ────────────────────────────────────
    // O tipo do backend (BookmarkReminderBlueprint::getType) e esta chave precisam
    // ser idênticos, ou o alerta sai em branco. O renderer fica registrado mesmo com
    // o sistema desligado, para os alertas antigos; só a linha das preferências some.
    app.notificationComponents.avocadoBookmarkReminder = BookmarkReminderNotification;

    extend('flarum/forum/components/NotificationGrid', 'notificationTypes', function (items: any) {
      if (!avocadoBookmarksEnabled()) return;
      items.add('avocadoBookmarkReminder', {
        name: 'avocadoBookmarkReminder',
        icon: 'fas fa-bookmark',
        label: trans('ramon-avocado.forum.settings.notify_bookmark_reminder_label', 'Bookmark reminders'),
      });
    });

    // ── User hover card on post authors ───────────────────────────────────
    // Acopla o card ao próprio <h3 className="PostUser-name"> em vez de envolvê-lo:
    // um wrapper o tiraria de "filho direto de .PostUser", quebrando o CSS e
    // extensões que acham o nó por vnode (ex.: FoF Gamification, que lê .children
    // sem checar null). hoverCardAttrs() devolve {} com o card desligado.
    extend('flarum/forum/components/PostUser', 'userViewItems', function (items: any, user: any) {
      if (!user || !items.has('postUser-name')) return;

      const name = items.get('postUser-name');
      if (name && name.attrs) Object.assign(name.attrs, hoverCardAttrs(user));

      // Selo no dia do aniversário de conta, entre o nome e os badges.
      items.add('avocadoCakeday', <CakedayBadge user={user} />, 95);
    });

    // O avatar da coluna lateral abre o mesmo card, como no core. Com autor, o avatar
    // vem dentro do Link para o perfil: os handlers vão nele e o clique continua
    // navegando. Registrado antes do wrapper de avatar e badges (sideItems, abaixo),
    // para o card ancorar na foto e não no bloco todo.
    extend(CommentPost.prototype, 'sideItems', function (items: any) {
      const user = this.attrs.post.user?.();
      if (!user || !items.has('avatar')) return;

      const avatar = items.get('avatar');
      if (avatar && avatar.attrs) Object.assign(avatar.attrs, hoverCardAttrs(user));
    });

    // O core tem seu próprio popover (CommentPost.showCard → UserCard--popover)
    // no mesmo hover — com o nosso card ativo, os dois abririam empilhados.
    // Anular showCard mantém cardVisible=false e o popover nativo nunca monta.
    override(CommentPost.prototype, 'showCard', function (original: () => void) {
      if (app.forum?.attribute('avocadoUserCardEnabled')) return;
      return original();
    });

    // ── Typing indicator restyle (flarum/realtime) ────────────────────────
    // O container padrão (.TypingUsersContainer) fica oculto pelo LESS e este item o
    // substitui, com o estado de digitação e as traduções do próprio realtime. Sem
    // ninguém digitando o wrapper fica vazio, mas presente, para não deslocar o layout.
    extend('flarum/forum/components/PostStream', 'endItems', function (items: any) {
      if (!this.discussion?.attribute('canViewWhoTypes')) return;

      const typingState = this.discussion.typingState;
      if (!typingState) return;

      const names = Object.keys(typingState.active());
      const count = names.length;
      const max = 3;
      const showUsers = app.session.user?.preferences()?.['flarum-realtime.typing-indicator-full'] ?? true;

      const text =
        count > 0
          ? showUsers
            ? app.translator.trans('flarum-realtime.forum.typing-indicator.users-are-typing', {
                users: names.slice(0, max).join(', '),
                count,
                others: Math.max(count - max, 0),
              })
            : app.translator.trans('flarum-realtime.forum.typing-indicator.people-are-typing', { number: count })
          : null;

      const findAvatar = (name: string): string | null => {
        try {
          const user = (app.store.all('users') as any[]).find((u: any) => u.displayName?.() === name);
          return user?.avatarUrl?.() || null;
        } catch {
          return null;
        }
      };

      // A pílula nasce na coluna do TEXTO dos posts — onde a resposta que está
      // sendo escrita vai aparecer —, não na borda da lista, em cima da linha do
      // tempo. O recuo é medido no último post em vez de copiado do CSS: a
      // coluna muda com o layout (editorial, badges ao lado, celular…).
      const alignToPosts = (vnode: any) => {
        const el = vnode.dom as HTMLElement;
        const stream = el.parentElement;
        if (!stream || count === 0) return;

        const mains = stream.querySelectorAll<HTMLElement>('.PostStream-item .CommentPost .Post-main');
        const main = mains[mains.length - 1];
        const indent = main ? Math.max(0, Math.round(main.getBoundingClientRect().left - stream.getBoundingClientRect().left)) : 0;
        el.style.setProperty('--avocado-typing-indent', `${indent}px`);
      };

      items.add(
        'avocadoTyping',
        <div
          className={`AvocadoTyping${count > 0 ? ' is-active' : ''}`}
          key="avocadoTyping"
          aria-live="polite"
          oncreate={alignToPosts}
          onupdate={alignToPosts}
        >
          {count > 0 && (
            <div className="AvocadoTyping-pill">
              <span className="AvocadoTyping-avatars" aria-hidden="true">
                {names.slice(0, max).map((name) => {
                  const url = findAvatar(name);
                  return url ? (
                    <img key={name} className="AvocadoTyping-avatar" src={url} alt="" title={name} />
                  ) : (
                    <span key={name} className="AvocadoTyping-avatar AvocadoTyping-avatar--initial" title={name}>
                      {name.charAt(0).toUpperCase()}
                    </span>
                  );
                })}
              </span>
              <span className="AvocadoTyping-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="AvocadoTyping-text">{text}</span>
            </div>
          )}
        </div>,
        70
      );
    });

    // ── WelcomeHero isHidden + view overrides ──────────────────────────────
    override(WelcomeHero.prototype, 'isHidden', function (original) {
      if (customHomeEnabled()) return true; // a home V2 tem o próprio banner
      if (hasSearchQuery()) return true; // resultados de busca não têm hero
      if (app.session.user) return true; // quem está logado nunca vê o banner
      if (app.forum?.attribute('avocadoHeroImage')) return false;
      return original();
    });

    override(WelcomeHero.prototype, 'view', function (original, vnode) {
      const heroImage = app.forum?.attribute('avocadoHeroImage');

      if (!heroImage) return original(vnode);

      const heroUrl = resolveAssetUrl(heroImage);
      const pos = app.forum?.attribute('avocadoHeroImagePosition') || 'center top';

      const imgEl = (
        <img
          src={heroUrl}
          className="Hero--banner-img"
          fetchpriority="high"
          loading="eager"
          decoding="async"
          style={{ objectPosition: pos }}
          alt=""
          aria-hidden="true"
        />
      );

      const colorOverlay = <div className="Hero--banner-colorOverlay" aria-hidden="true" />;

      const result = original(vnode);

      if (result && result.attrs) {
        result.attrs.className = (result.attrs.className || '') + ' Hero--banner';
        const kids = Array.isArray(result.children) ? result.children : result.children != null ? [result.children] : [];
        result.children = [imgEl, colorOverlay, ...kids];
        return result;
      }

      return (
        <header className="Hero WelcomeHero Hero--banner">
          {imgEl}
          {colorOverlay}
        </header>
      );
    });

    // ── TagsPage: completely replace view ────────────────────────────────
    // Os imports `ext:flarum/tags/...` chegam undefined com o flarum/tags desligado.
    if (TagsPage) override(TagsPage.prototype, 'view', tagPageView);

    // ── DiscussionsSearchSource: point "see all" link to /search ─────────
    // O padrão aponta para app.route('index', {q}) (/all?q=…); leva para /search.
    flarum.reg
      .asyncModuleImport('flarum/forum/components/DiscussionsSearchSource')
      .then((DiscussionsSearchSource) => {
        extend(DiscussionsSearchSource.prototype, 'view', function (vnode) {
          if (!vnode || !Array.isArray(vnode)) return;
          // app.route('index') pode ser '/' ou '/all': compara só o caminho, para valer nos dois.
          const indexBasePath = app.route('index').split('?')[0];
          const patchNode = (node) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {
              node.forEach(patchNode);
              return;
            }
            if (node.attrs?.href) {
              const href = node.attrs.href;
              if (typeof href === 'string' && href.split('?')[0] === indexBasePath) {
                const url = new URL(href, window.location.origin);
                url.pathname = app.route('avocado-search');
                node.attrs.href = url.pathname + url.search;
                const q = url.searchParams.get('q') || '';
                // replace:true quando já está na busca, para o Voltar não cair em entradas
                // /search vazias no histórico.
                node.attrs.onclick = (e) => {
                  e.preventDefault();
                  const onSearch = app.current.get('routeName') === 'avocado-search';
                  m.route.set(app.route('avocado-search', { q }), null, onSearch ? { replace: true } : {});
                };
              }
            }
            if (Array.isArray(node.children)) node.children.forEach(patchNode);
          };
          patchNode(vnode);
        });
      })
      .catch(() => {});

    // ── GlobalDiscussionsSearchSource: point "see all" link to /search ──────
    // O fullPage() linka para /?q=…, e o redirecionamento do IndexPage deixaria uma
    // entrada /search vazia no histórico: navega direto, com replace:true já na
    // busca. Um <button>, e não <a>, faz o SelectResult() cair no button.click(),
    // então o Enter do teclado também passa por aqui.
    flarum.reg
      .asyncModuleImport('flarum/forum/components/GlobalDiscussionsSearchSource')
      .then((GlobalDiscussionsSearchSource) => {
        override(GlobalDiscussionsSearchSource.prototype, 'fullPage', function (_original, query: string) {
          const href = app.route('avocado-search', { q: query });
          return (
            <li>
              <button
                className="Button Button--link"
                onclick={(e: Event) => {
                  e.preventDefault();
                  const onSearch = app.current.get('routeName') === 'avocado-search';
                  m.route.set(href, null, onSearch ? { replace: true } : {});
                }}
              >
                <i className="fas fa-search icon Button-icon" aria-hidden="true" />
                <span className="Button-label">{app.translator.trans('core.lib.search_source.discussions.all_button', { query })}</span>
              </button>
            </li>
          );
        });
      })
      .catch(() => {});

    // ── SearchModal: Avocado spotlight UI (V2 search) ────────────────────
    // O SearchModal nativo do v2 vira um painel spotlight: abas com ícones, ESC na
    // linha do campo e rodapé com dicas de teclado. O layout fica em
    // less/forum/SearchModal.less. O modal é lazy, e o extend() por string espera o
    // flarum.reg.onLoad.
    {
      const TAB_ICONS: Record<string, string> = {
        discussions: 'fas fa-comments',
        posts: 'fas fa-comment-dots',
        users: 'fas fa-user',
        tags: 'fas fa-tag',
      };

      const hasClass = (node: any, cls: string) => typeof node?.attrs?.className === 'string' && node.attrs.className.split(/\s+/).includes(cls);

      const findVnode = (root: any, predicate: (n: any) => boolean): any => {
        if (!root) return null;
        if (Array.isArray(root)) {
          for (const child of root) {
            const found = findVnode(child, predicate);
            if (found) return found;
          }
          return null;
        }
        if (typeof root !== 'object') return null;
        if (predicate(root)) return root;
        if (Array.isArray(root.children)) return findVnode(root.children, predicate);
        return null;
      };

      // 1. tabItems: um ícone FA em cada aba (o Button desenha o ícone pelo attr `icon`).
      extend('flarum/common/components/SearchModal', 'tabItems', function (items) {
        if (!items || typeof items.has !== 'function') return;
        const sources = (this as any).sources || [];
        sources.forEach((source: any) => {
          if (!items.has(source.resource)) return;
          const tab = items.get(source.resource);
          if (!tab || typeof tab !== 'object') return;
          tab.attrs = tab.attrs || {};
          tab.attrs.icon = TAB_ICONS[source.resource] || 'fas fa-search';
        });
      });

      // 2. content: ESC na linha do campo e rodapé no corpo. O Mithril memoiza os
      //    arrays de filhos por referência: altera no lugar e evita injetar duas vezes.
      extend('flarum/common/components/SearchModal', 'content', function (vnode) {
        if (!vnode || typeof vnode !== 'object') return;
        const self: any = this;

        // O ESC é um botão de fechar de verdade, dentro de .SearchModal-form.
        const formRow = findVnode(vnode, (n) => hasClass(n, 'SearchModal-form'));
        if (formRow && Array.isArray(formRow.children)) {
          const already = formRow.children.some((c: any) => hasClass(c, 'Avocado-searchModal-kbd'));
          if (!already) {
            formRow.children.push(
              <button
                type="button"
                className="Avocado-searchModal-kbd Avocado-searchModal-kbd--close"
                aria-label={trans('ramon-avocado.forum.search.close', 'Close (Escape)')}
                onclick={(e: Event) => {
                  e.preventDefault();
                  self.hide?.();
                }}
              >
                {trans('ramon-avocado.forum.search.esc_key', 'ESC')}
              </button>
            );
          }
        }

        if (Array.isArray(vnode.children)) {
          const already = vnode.children.some((c: any) => hasClass(c, 'Avocado-searchModal-foot'));
          if (!already) {
            vnode.children.push(
              <div className="Avocado-searchModal-foot">
                <span>
                  {trans('ramon-avocado.forum.search.tip', 'Tip: prefix ')}
                  {/* eslint-disable-next-line i18n/no-hardcoded-text -- 'tag:' is the literal search operator users type */}
                  <strong>tag:</strong>
                  {trans('ramon-avocado.forum.search.tip_suffix', ' to filter by tag')}
                </span>
                <div className="Avocado-searchModal-foot-keys">
                  <span className="Avocado-searchModal-kbd" aria-hidden="true">
                    ↑
                  </span>
                  <span className="Avocado-searchModal-kbd" aria-hidden="true">
                    ↓
                  </span>
                  <span className="Avocado-searchModal-kbd" aria-hidden="true">
                    ↵
                  </span>
                </div>
              </div>
            );
          }
        }
      });

      // 3. activeTabItems: com busca em andamento, linhas de skeleton no lugar do
      //    LoadingIndicator, para o layout não encolher num spinner. Só com texto digitado.
      extend('flarum/common/components/SearchModal', 'activeTabItems', function (items) {
        if (!items || typeof items.has !== 'function') return;
        const self: any = this;
        const activeResource = self.activeSource?.()?.resource;
        const loading = (self.loadingSources || []).includes(activeResource);
        const query = typeof self.query === 'function' ? (self.query() || '').trim() : '';
        if (!loading || !query) return;

        const skeletonRow = (i: number) => (
          <li key={`skel-${i}`} className="Avocado-searchSkeleton" aria-hidden="true">
            <span className="Avocado-searchSkeleton-av" />
            <div className="Avocado-searchSkeleton-body">
              <span className="Avocado-searchSkeleton-line Avocado-searchSkeleton-line--title" />
              <span className="Avocado-searchSkeleton-line Avocado-searchSkeleton-line--meta" />
            </div>
          </li>
        );

        if (!items.has('results')) return;
        items.setContent(
          'results',
          <div className="SearchModal-section">
            <hr className="Modal-divider" />
            <ul className="Dropdown-menu SearchModal-results SearchModal-results--skeleton" aria-busy="true" aria-live="polite">
              {[0, 1, 2, 3, 4].map(skeletonRow)}
            </ul>
          </div>
        );
      });

      // 4. clear: o ESC no campo chama clear(), que só esvazia a busca; aqui ele fecha
      //    o modal, como o selo ESC promete.
      override('flarum/common/components/SearchModal', 'clear', function (_orig) {
        const self: any = this;
        self.hide?.();
      });

      // 5. setIndex: o navegador de teclado do core rola $items.parent(), mas aqui o
      //    contêiner de rolagem é `.SearchModal-tabs-content`; sem isto ↑/↓ movem o
      //    foco e a linha fica fora da tela. Mesmo algoritmo, no contêiner certo.
      override('flarum/common/components/SearchModal', 'setIndex', function (_orig, index: number, scrollToItem: boolean = false) {
        const self: any = this;
        const $items = self.selectableItems();
        const $scroll = self.$('.SearchModal-tabs-content');

        let fixedIndex = index;
        if (index < 0) fixedIndex = $items.length - 1;
        else if (index >= $items.length) fixedIndex = 0;

        const $item = $items.removeClass('active').eq(fixedIndex).addClass('active');
        self.index = parseInt($item.attr('data-index') as string) || fixedIndex;

        if (!scrollToItem || !$scroll.length || !$item.length) return;

        const scrollTop = $scroll.scrollTop()!;
        const containerTop = $scroll.offset()!.top;
        const containerH = $scroll.outerHeight()!;
        const containerBot = containerTop + containerH;
        const itemTop = $item.offset()!.top;
        const itemBot = itemTop + $item.outerHeight()!;
        const padTop = parseInt($scroll.css('padding-top'), 10) || 0;
        const padBot = parseInt($scroll.css('padding-bottom'), 10) || 0;

        let target: number | undefined;
        if (itemTop < containerTop + padTop) {
          target = scrollTop + (itemTop - containerTop) - padTop;
        } else if (itemBot > containerBot - padBot) {
          target = scrollTop + (itemBot - containerBot) + padBot;
        }

        if (typeof target === 'number') {
          $scroll.stop(true).animate({ scrollTop: target }, 100);
        }
      });
    }

    // ── GlobalSearch view override (V1 search) ────────────────────────────
    // Desligado por padrão: o `boolval` do serializeToForum transforma setting vazia
    // em `false`, e o padrão daqui precisa bater. O CSS correspondente depende de
    // html[data-avocado-search="v1"] (Content/SearchStyle.php), senão encaixotaria o
    // botão do V2 num espaço fixo de 200px.
    override(GlobalSearch.prototype, 'view', function (original, ...args) {
      if (!settingEnabled('avocadoSearchV1', false)) return original.apply(this, args);
      return <Search state={this.searchState} />;
    });

    // ── Search view extend (V1 search icons + truncate) ───────────────────
    extend(Search.prototype, 'view', function (vnode) {
      if (!settingEnabled('avocadoSearchV1', false)) return;
      if (!vnode || !Array.isArray(vnode.children)) return;

      const searchInput = vnode.children.find(
        (c) => c && c.attrs && typeof c.attrs.className === 'string' && c.attrs.className.includes('Search-input')
      );
      if (searchInput) {
        searchInput.attrs.className = 'Input Search-input Input--withPrefix Input--withClear';
        if (Array.isArray(searchInput.children)) {
          searchInput.children.unshift(<i aria-hidden="true" className="icon fas fa-search Input-prefix-icon" />);
        }
      }

      const walkAndTruncate = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(walkAndTruncate);
          return;
        }

        if (node.attrs?.className?.includes('DiscussionSearchResult-excerpt') && Array.isArray(node.children)) {
          let remaining = 200;
          node.children = node.children.reduce((acc, child) => {
            if (remaining <= 0) return acc;
            if (typeof child === 'string') {
              if (child.length >= remaining) {
                acc.push(child.slice(0, remaining) + '…');
                remaining = 0;
              } else {
                acc.push(child);
                remaining -= child.length;
              }
            } else if (child && typeof child === 'object') {
              const text = typeof child.children?.[0] === 'string' ? child.children[0] : '';
              if (text.length >= remaining) {
                child.children = [text.slice(0, remaining) + '…'];
                acc.push(child);
                remaining = 0;
              } else {
                acc.push(child);
                remaining -= text.length;
              }
            }
            return acc;
          }, []);
          return;
        }

        if (Array.isArray(node.children)) node.children.forEach(walkAndTruncate);
      };

      walkAndTruncate(vnode);
    });

    // ── DiscussionListItem elementAttrs (tag color + unread class) ─────────
    extend(DiscussionListItem.prototype, 'elementAttrs', function (attrs) {
      const firstTag = this.attrs.discussion.tags?.()?.[0];
      const color = firstTag?.color?.();
      if (color) attrs.style = { '--tag-color': iconColors(color).color, ...(attrs.style || {}) };
      if (this.attrs.discussion.isUnread?.()) {
        attrs.className = `${attrs.className || ''} DiscussionListItem--unread`;
      }
    });

    // ── CommentPost elementAttrs (fixedAvatar class) ──────────────────────
    extend(CommentPost.prototype, 'elementAttrs', function (attrs) {
      if (!settingEnabled('avocadoFixedAvatarEffect')) return;
      attrs.className = `${attrs.className || ''} CommentPost--fixedAvatar`;
    });

    // ── Posição dos badges de grupo no post ──────────────────────────────
    // O setting vira classes no <html> e o desenho é todo CSS (forum/PostBadges.less).
    // Fica na raiz porque o valor é do fórum inteiro e nenhum redraw a apaga.
    //
    // `--custom` é a chave geral: toda regra de PostBadges.less depende dela, então
    // 'default' sai sem classe e o badge volta ao disco do core sobre o avatar. Só
    // as posições fora do padrão ganham classe própria; 'side_icons' leva `--side`
    // (coluna larga, troca de lista) e `--side-icons` (fila em vez de pilha).
    {
      const badgePosition = (): string => String(app.forum?.attribute('avocadoPostBadgePosition') || 'inline');
      const syncBadgePositionClass = () => {
        const pos = badgePosition();
        const root = document.documentElement.classList;
        root.toggle('avocado-badges--custom', pos !== 'default');
        root.toggle('avocado-badges--below', pos === 'below');
        root.toggle('avocado-badges--side', pos === 'side' || pos === 'side_icons');
        root.toggle('avocado-badges--side-icons', pos === 'side_icons');
      };
      // beforeMount roda depois de app.forum existir e antes do primeiro render.
      app.beforeMount(syncBadgePositionClass);
    }

    // ── CommentPost sideItems: wrap avatar + badges in position:relative div ─
    // position:sticky não cria bloco de contenção para filhos absolutos: avatar e
    // badges vão num div position:relative, e o badge fica sempre no canto da foto.
    //
    // O clone serve ao avatar fixo e às posições "embaixo do avatar", que precisam
    // da lista dentro do .Post-side. São independentes, por isso o guarda testa as duas.
    extend(CommentPost.prototype, 'sideItems', function (items) {
      const badgesInSideColumn = ['side', 'side_icons'].includes(String(app.forum?.attribute('avocadoPostBadgePosition') || 'inline'));
      if (!settingEnabled('avocadoFixedAvatarEffect') && !badgesInSideColumn) return;
      // O linkrobins/badge-labels desenha os badges como pílulas e posiciona a lista
      // por conta própria. Este clone sai de `user.badges()` e passaria por fora disso,
      // repetindo os badges. A extensão marca presença com uma classe no <html>.
      if (document.documentElement.classList.contains('lrBadgeLabels')) return;
      const user = this.attrs.post.user();
      if (!user) return;
      const badges = user.badges?.().toArray?.() ?? [];
      if (!badges.length || !items.has('avatar')) return;

      const avatarNode = items.get('avatar');
      items.remove('avatar');
      items.add(
        'avatar',
        <div className="Post-side-inner">
          {avatarNode}
          <ul className="PostUser-badges badges badges--packed PostUser-badges--inSide">{listItems(badges)}</ul>
        </div>,
        100
      );
    });

    // A prévia ao vivo da resposta (CommentPost editing da ReplyPlaceholder) é markup
    // do core e não passa pelo sideItems: ganha aqui o mesmo wrapper e clone.
    extend('flarum/forum/components/ReplyPlaceholder', 'view', function (vnode) {
      if (!['side', 'side_icons'].includes(String(app.forum?.attribute('avocadoPostBadgePosition') || 'inline'))) return;
      if (document.documentElement.classList.contains('lrBadgeLabels')) return;
      if (vnode?.tag !== 'article') return;
      const badges = app.session.user?.badges?.().toArray?.() ?? [];
      if (!badges.length) return;

      const findByClass = (node, cls) => {
        if (!node || typeof node !== 'object') return null;
        const classes = String(node.attrs?.className || '').split(' ');
        if (classes.includes(cls)) return node;
        for (const child of Array.isArray(node.children) ? node.children : []) {
          const found = findByClass(child, cls);
          if (found) return found;
        }
        return null;
      };

      const side = findByClass(vnode, 'Post-side');
      if (!side || !Array.isArray(side.children)) return;
      side.children = [
        <div className="Post-side-inner" key="avocado-side-inner">
          {side.children}
          <ul className="PostUser-badges badges badges--packed PostUser-badges--inSide">{listItems(badges)}</ul>
        </div>,
      ];
    });

    // ── CommentPost oncreate/onupdate (badges + duplicate avatar fix) ────────
    // O avatar duplicado é escondido pelo CSS (DiscussionPage.less): removê-lo pelo
    // JS dá erro de removeChild, porque o Mithril ainda rastreia o nó. Pelo mesmo
    // motivo os badges não são movidos: um clone fora do Mithril fica no Post-side.
    //
    // CTA para guests depois do post configurado. O PostStream é code-split: o
    // extend/override por string aplica o patch quando o módulo carrega.
    {
      // 1–5 = depois do post de mesmo número; 'end' = no fim da discussão.
      const getCtaPosition = (): number | 'end' => {
        try {
          const pos = String(app.forum?.attribute('avocadoPostCtaPosition') ?? '1');
          if (pos === 'end') return 'end';
          const parsed = parseInt(pos, 10);
          return parsed >= 1 && parsed <= 5 ? parsed : 1;
        } catch (e) {
          return 1;
        }
      };

      // O texto do admin vence; vazio, vale a frase da tradução.
      const ctaText = () =>
        String(app.forum?.attribute('avocadoPostCtaText') ?? '').trim() || app.translator.trans('ramon-avocado.forum.post_cta.text');

      // `key` só para o fim da discussão: os endItems do core são uma lista
      // com chave, e um item sem chave no meio dela quebra o render.
      const renderCta = (key?: string) => (
        <div className="PostStream-item PostStream-avocadoCta" key={key}>
          <div className="AvocadoPostCta-wrapper">
            <div className="AvocadoPostCta">
              <span className="AvocadoPostCta-text">{ctaText()}</span>
              <span className="AvocadoPostCta-buttons">
                <Button
                  className="Button Button--primary AvocadoPostCta-btn AvocadoPostCta-btn--login"
                  icon="fas fa-sign-in-alt"
                  onclick={() => flarum.reg.asyncModuleImport('flarum/forum/components/LogInModal').then((M) => app.modal.show(M))}
                >
                  {app.translator.trans('core.forum.header.log_in_link')}
                </Button>
                <span className="AvocadoPostCta-or">{app.translator.trans('ramon-avocado.forum.post_cta.or')}</span>
                <Button
                  className="Button AvocadoPostCta-btn AvocadoPostCta-btn--signup"
                  icon="fas fa-user-plus"
                  onclick={() => flarum.reg.asyncModuleImport('flarum/forum/components/SignUpModal').then((M) => app.modal.show(M))}
                >
                  {app.translator.trans('core.forum.header.sign_up_link')}
                </Button>
              </span>
            </div>
          </div>
        </div>
      );

      const ctaEnabled = () => settingEnabled('avocadoShowPostCta', false);

      // Posição 1: afterFirstPostItems, o gancho do core depois do primeiro post.
      extend('flarum/forum/components/PostStream', 'afterFirstPostItems', function (items) {
        if (!ctaEnabled() || app.session.user) return;
        if (getCtaPosition() === 1) items.add('avocado-post-cta', renderCta(), 100);
      });

      // Posições 2-5: extend (não override) no view(), para não engolir patches de
      // outras extensões, inserindo o CTA depois do N-ésimo post.
      extend('flarum/forum/components/PostStream', 'view', function (rootVnode) {
        if (!ctaEnabled() || app.session.user) return;

        const pos = getCtaPosition();
        if (pos === 1 || pos === 'end') return; // afterFirstPostItems acima, endItems abaixo

        const children = rootVnode?.children;
        if (!Array.isArray(children)) return;

        // Só posts de comentário contam: posts de evento (fixado, trancado, renomeado…)
        // têm outro data-type e não avançam o contador.
        let count = 0;
        for (let i = 0; i < children.length; i++) {
          const attrs = children[i]?.attrs;
          if (attrs?.['data-number'] && attrs?.['data-type'] === 'comment') {
            if (++count === pos) {
              children.splice(i + 1, 0, renderCta());
              break;
            }
          }
        }
      });

      // No fim da discussão: endItems é o gancho do core para o que vem depois
      // do último post (só existe com o fim carregado), antes da caixa de resposta.
      extend('flarum/forum/components/PostStream', 'endItems', function (items) {
        if (!ctaEnabled() || app.session.user) return;
        if (getCtaPosition() === 'end') items.add('avocado-post-cta', renderCta('avocado-post-cta'), 80);
      });
    }

    // O onupdate roda a cada redraw da página em todos os posts montados, mas as
    // varreduras abaixo só importam quando o HTML do post muda: dados novos no model
    // (o pushData troca `freshness`, o truque do core), entrar/sair da edição ou
    // revelar um post oculto. Essa assinatura fica no componente; na edição a prévia
    // se reescreve sozinha, então ali roda todo redraw.
    const postDomChanged = (component): boolean => {
      const post = component.attrs?.post;
      const editing = !!component.isEditing?.();
      const fresh = post?.freshness;
      const reveal = !!component.revealContent;
      const changed =
        editing ||
        component._avFresh !== fresh ||
        component._avEditing !== editing ||
        component._avReveal !== reveal ||
        component._avEl !== component.element;
      component._avFresh = fresh;
      component._avEditing = editing;
      component._avReveal = reveal;
      component._avEl = component.element;
      return changed;
    };

    const enhancePost = (component) => {
      syncUserOnline(component);
      if (!postDomChanged(component)) return;
      gateGuestLinks(component);
      initCodeBlocks(component.element);
      initGalleryNav(component.element);
      fixReactionCounts(component.element);
      fixUnreactButton(component.element);
      initThreadsTitleBlock(component);
    };

    extend(CommentPost.prototype, 'oncreate', function () {
      enhancePost(this);
    });
    extend(CommentPost.prototype, 'onupdate', function () {
      enhancePost(this);
    });

    // ── CommentPost actionItems (share button) ────────────────────────────
    extend(CommentPost.prototype, 'actionItems', function (items) {
      if (!settingEnabled('avocadoShowShare')) return;
      const post = this.attrs.post;
      items.add(
        'avocado-share',
        <button
          className="Button Button--link avocado-action-btn avocado-share-btn"
          onclick={(e) => {
            const url = getPostPermalink(post);
            const el = e.currentTarget;
            if (navigator.share) {
              navigator.share({ title: post.discussion()?.title?.() || document.title, url }).catch(() => {});
            } else {
              copyTextToClipboard(url)
                .then(() => {
                  el.classList.add('avocado-share-done');
                  setTimeout(() => el.classList.remove('avocado-share-done'), 2000);
                })
                .catch(() => {});
            }
          }}
        >
          <span className="avocado-action-face">
            <i className="avocado-action-icon icon fas fa-share" aria-hidden="true" />
          </span>
          <span className="avocado-action-label">{trans('ramon-avocado.forum.actions.share', 'Share')}</span>
        </button>,
        -5
      );
    });

    // ── PostEdited: show pencil icon instead of text ─────────────────────
    override(PostEdited.prototype, 'view', function () {
      const post = this.attrs.post;
      const editedUser = post.editedUser?.();
      const editedInfo = app.translator.trans('core.forum.post.edited_tooltip', { user: editedUser, ago: humanTime(post.editedAt?.()) });
      return (
        <Tooltip text={editedInfo}>
          <span className="PostEdited">
            <i className="fas fa-pencil-alt" aria-hidden="true" />
          </span>
        </Tooltip>
      );
    });

    // ── DiscussionControls userControls (reply icon) ─────────────────────
    extend(DiscussionControls, 'userControls', function (items) {
      if (!items.has('reply')) return;
      const reply = items.get('reply');
      if (reply && reply.attrs) {
        reply.attrs.icon = 'fa-solid fa-reply';
      }
    });

    // ── CommentPost actionItems (like/reply icons) ────────────────────────
    extend(CommentPost.prototype, 'actionItems', function (items) {
      if (!settingEnabled('avocadoShowActionIcons')) return;
      if (items.has('like')) {
        const post = this.attrs.post;
        const likes = post.likes?.();
        const isLiked = app.session.user && likes && likes.some((user) => user === app.session.user);
        const like = items.get('like');
        if (like && like.attrs) {
          like.attrs.icon = isLiked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up';
        }
      }
      if (items.has('reply')) {
        const reply = items.get('reply');
        if (reply && reply.attrs) {
          reply.attrs.icon = 'fa-solid fa-reply';
        }
      }
    });

    // ── CommentPost headerItems: OP badge on post #1 ────────────────────
    // headerItems(): 'user'@100, 'meta'@0; o selo em 50 fica entre o nome e a hora.
    extend(CommentPost.prototype, 'headerItems', function (items) {
      const post = this.attrs?.post;
      if (post?.number?.() !== 1) return;
      items.add('avocado-op', <span className="AvocadoPost-opBadge">{trans('ramon-avocado.forum.post.op_badge', 'OP')}</span>, 50);
    });

    // ── DiscussionPage oncreate/onupdate: threads class + "Back" label ────
    // this.element.classList em vez de setClassName: o vdom do view() pode ser o
    // PageStructure, cuja className não vai direto para o div .Page.DiscussionPage.
    const syncThreadsClass = (el: HTMLElement) => {
      if (!el) return;
      const enabled = settingEnabled('avocadoThreadsStyle', false);
      // Roda a cada redraw: só escreve quando muda, para não gerar mutação à toa.
      if (el.classList.contains('avocado-threads') !== enabled) el.classList.toggle('avocado-threads', enabled);
    };

    extend(DiscussionPage.prototype, 'oncreate', function () {
      syncThreadsClass(this.element);
      addThreadsBackLabel(this.element);
    });
    extend(DiscussionPage.prototype, 'onupdate', function () {
      syncThreadsClass(this.element);
      addThreadsBackLabel(this.element);
    });

    // ── DiscussionPage sidebarItems: stats card ──────────────────────────
    // 'controls'@100, 'scrubber'@-100: as estatísticas em 0 ficam no meio.
    extend(DiscussionPage.prototype, 'sidebarItems', function (items) {
      const discussion = this.discussion;
      if (!discussion) return;
      items.add('avocado-stats', <AvocadoDiscussionStats discussion={discussion} />, 0);
    });

    // ── TextEditor emoji dropdown: fix viewport positioning in AvocadoHome ─
    // A extensão de emoji aplica coordenadas relativas ao textarea como top/left de
    // um elemento position:fixed, e ele cai perto de (0,0). Um segundo listener,
    // depois do dela, reposiciona com getBoundingClientRect().
    extend(TextEditor.prototype, 'buildEditorParams', function (params) {
      params.inputListeners.push(() => {
        if (!this.emojiDropdown?.active) return;
        const composerBody = this.element?.closest?.('.AvocadoHome-composerBody');
        if (!composerBody) return;

        const textarea = this.element?.querySelector?.('.TextEditor-editor');
        if (!textarea) return;

        const dropdownEl = this.emojiDropdown.$()[0];
        if (!dropdownEl) return;

        const textareaRect = textarea.getBoundingClientRect();
        const dropdownH = dropdownEl.offsetHeight || 280;
        const dropdownW = dropdownEl.offsetWidth || 300;

        const selection = this.attrs.composer.editor.getSelectionRange?.();
        if (!selection) return;
        const caret = this.attrs.composer.editor.getCaretCoordinates?.(selection[0]);
        if (!caret) return;

        let vTop = textareaRect.top + caret.top + 15;
        let vLeft = textareaRect.left + caret.left;

        // Sem espaço abaixo, abre acima do cursor.
        if (vTop + dropdownH > window.innerHeight - 8) {
          vTop = textareaRect.top + caret.top - dropdownH - 15;
        }

        vTop = Math.max(4, Math.min(vTop, window.innerHeight - dropdownH - 4));
        vLeft = Math.max(4, Math.min(vLeft, window.innerWidth - dropdownW - 4));

        this.emojiDropdown.$().css({ top: vTop + 'px', left: vLeft + 'px' });
      });
    });

    // ── Protect ProseMirror from unsafe focus calls during drag events ─────
    // Arrastando cards, o ProseMirror pode tentar focar um editor destruído ou
    // inacessível: focus/blur ganham uma checagem.
    extend(TextEditor.prototype, 'buildEditorParams', function (params) {
      const originalFocus = params.editor?.focus;
      if (originalFocus && typeof originalFocus === 'function') {
        params.editor.focus = function () {
          try {
            if (this && typeof originalFocus.call === 'function') {
              return originalFocus.call(this);
            }
          } catch (e) {
            // Ignora erros de foco durante o arraste ou com o editor desmontado.
            return;
          }
        };
      }
    });

    const originalError = window.onerror;
    window.onerror = function (msg, url, lineNo, colNo, error) {
      // "Cannot read properties of undefined (reading 'focus')" acontece no arraste,
      // com editores montando e desmontando.
      if (msg && msg.includes && msg.includes('Cannot read properties of undefined') && msg.includes('focus')) {
        return true;
      }
      if (typeof originalError === 'function') {
        return originalError(msg, url, lineNo, colNo, error);
      }
      return false;
    };

    // ── Footer — render admin's custom_footer inside the Mithril mount ───
    // A cópia do servidor sai no bootstrap (acima), então esta é a única. O <style>
    // do admin sobe para o <head>: dentro da árvore do Mithril o m.trust o
    // reinseriria a cada redraw, forçando recálculo de estilo. Os filhos de um
    // <footer> sobem para a raiz, porque o mount já é <footer id="footer">.
    let _avFooterContent: string | null = null;
    override(Footer.prototype, 'view', function () {
      // O rodapé do tema (admin › Aparência › Rodapé) ocupa o lugar do HTML
      // colado em "Editar rodapé personalizado": os dois juntos seriam dois rodapés.
      if (settingEnabled('avocadoFooterEnabled', false)) return m(AvocadoFooter);

      if (_avFooterContent === null) {
        // Sanitiza o HTML do admin antes do parse, tirando on*= e esquemas perigosos.
        // <style> sobrevive (é o contrato do campo) e sobe para o <head> abaixo.
        const html = sanitizeAdminHtml(app.forum.attribute('footerHtml') as string);
        if (!html.trim()) {
          _avFooterContent = '';
        } else {
          const tmp = new DOMParser().parseFromString(html, 'text/html').body;

          // Deduplicado pelo conteúdo.
          tmp.querySelectorAll('style').forEach((styleEl) => {
            const css = styleEl.textContent || '';
            const exists = [...document.head.querySelectorAll('style[data-avocado-footer]')].some((s) => s.textContent === css);
            if (!exists && css.trim()) {
              const moved = document.createElement('style');
              moved.setAttribute('data-avocado-footer', '1');
              moved.textContent = css;
              document.head.appendChild(moved);
            }
            styleEl.parentNode?.removeChild(styleEl);
          });

          tmp.querySelectorAll('footer').forEach((f) => {
            const parent = f.parentNode;
            if (!parent) return;
            while (f.firstChild) parent.insertBefore(f.firstChild, f);
            parent.removeChild(f);
          });

          _avFooterContent = tmp.innerHTML;
        }
      }
      return _avFooterContent ? trustedHtml(_avFooterContent) : null;
    });

    // ── Guest link gating ─────────────────────────────────────────────────────
    // Com avocadoHideLinksForGuests, links no corpo dos posts viram um cadeado que
    // abre o login.

    // ── MessagesPage: Avocado design integration ──────────────────────────
    // O MessagesPage vem num chunk lazy do flarum/messages: no initializer o
    // flarum.reg.get() devolve undefined. Interceptar o flarum.reg.add() aplica o
    // override assim que o chunk avalia, antes ou depois deste initializer.

    // ── Inline reply component ───────────────────────────────────────────────
    // Usa o TextEditor nativo para ter a barra de markdown do compositor. O
    // rastreador no módulo deixa o botão Citar de cada mensagem mandar a citação
    // para a resposta montada, sem prop drilling.
    let _currentInlineReply: any = null;

    class AvocadoInlineReply {
      oninit() {
        this.value = '';
        this.sending = false;
        // Proxy mínimo do compositor que o TextEditor e a barra esperam.
        this.composerProxy = {
          isVisible: () => true,
          fields: { content: () => this.value },
        };
        _currentInlineReply = this;
      }
      oncreate() {
        _currentInlineReply = this;
      }
      onremove() {
        if (_currentInlineReply === this) _currentInlineReply = null;
      }
      view(vnode) {
        const { dialog, onSent } = vnode.attrs;
        const user = app.session.user;
        return (
          <div className="AvocadoMessages-inlineReply">
            {user && <Avatar user={user} />}
            <div className="AvocadoMessages-inlineReply-wrap">
              <TextEditor
                composer={this.composerProxy}
                value={this.value}
                placeholder={app.translator.trans('flarum-messages.forum.composer.placeholder') as string}
                disabled={this.sending}
                onchange={(value) => {
                  this.value = value;
                  m.redraw();
                }}
                onsubmit={() => this._send(dialog, onSent)}
                submitLabel={app.translator.trans('flarum-messages.forum.messages_page.send_message_button')}
              />
            </div>
          </div>
        );
      }
      // Citação BBCode no topo do editor, pelo botão Citar de cada mensagem.
      insertQuote(quotedText: string, authorName: string) {
        const cleanText = String(quotedText || '').trim();
        const cleanAuthor = String(authorName || '').trim() || 'user';
        const block = `[quote=${cleanAuthor}]\n${cleanText}\n[/quote]\n\n`;
        const next = block + (this.value || '');
        this.value = next;
        m.redraw();
        // O TextEditor só lê `value` na criação: mudanças externas vão direto no DOM para
        // o BasicEditorDriver/onchange pegarem.
        setTimeout(() => {
          const ta = document.querySelector<HTMLTextAreaElement>('.AvocadoMessages-inlineReply .TextEditor-editor');
          if (!ta) return;
          ta.value = next;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.focus();
          try {
            ta.setSelectionRange(next.length, next.length);
          } catch (_) {}
        }, 30);
      }
      _send(dialog, onSent) {
        const text = this.value.trim();
        if (!text || this.sending) return;
        this.sending = true;
        m.redraw();
        // app.request direto: Model.save({ dialog }) não serializa bem models como
        // relacionamentos do JSON:API.
        app
          .request({
            method: 'POST',
            url: `${app.forum.attribute('apiUrl')}/dialog-messages`,
            body: {
              data: {
                type: 'dialog-messages',
                attributes: { content: text },
                relationships: {
                  dialog: { data: { type: 'dialogs', id: String(dialog.id()) } },
                },
              },
            },
          })
          .then((response) => {
            try {
              app.store.pushPayload(response);
            } catch (_) {}
            this.value = '';
            this.sending = false;
            // Limpa também o textarea do DOM: depois de montar quem manda é o
            // BasicEditorDriver, e zerar `this.value` não basta.
            const ta = document.querySelector<HTMLTextAreaElement>('.AvocadoMessages-inlineReply .TextEditor-editor');
            if (ta) {
              ta.value = '';
              ta.style.height = ''; // zera a altura do auto-grow
              ta.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (typeof onSent === 'function') onSent(response);
            m.redraw();
          })
          .catch(() => {
            this.sending = false;
            m.redraw();
          });
      }
    }

    // ── MessageStream skeleton — replaces native LoadingIndicator ────────────
    const renderStreamSkeleton = () => (
      <div className="AvocadoMessages-skeleton-dialog" style="flex:1;padding-top:0">
        {[
          { out: false, w1: '55%', w2: '40%' },
          { out: true, w1: '45%', w2: null },
          { out: false, w1: '60%', w2: '35%' },
          { out: true, w1: '50%', w2: '30%' },
          { out: false, w1: '40%', w2: null },
          { out: true, w1: '65%', w2: '20%' },
        ].map((row, i) => (
          <div key={i} className={'AvocadoMessages-skeleton-dialog-msg' + (row.out ? ' is-out' : '')}>
            {!row.out && <div className="AvocadoMessages-skeleton-avatar AvocadoMessages-skeleton-avatar--sm" />}
            <div className="AvocadoMessages-skeleton-dialog-bubble-wrap">
              <div className="AvocadoMessages-skeleton-dialog-bubble" style={`width:${row.w1}`} />
              {row.w2 && <div className="AvocadoMessages-skeleton-dialog-bubble" style={`width:${row.w2}`} />}
            </div>
            {row.out && <div className="AvocadoMessages-skeleton-avatar AvocadoMessages-skeleton-avatar--sm" />}
          </div>
        ))}
      </div>
    );

    // ── MessageStream override: skeleton + inline reply ───────────────────────
    // Guarda o MessageStream montado para religar o handler de realtime quando o
    // canal privado do Pusher fica pronto: o flarum/messages liga no oncreate, e o
    // canal pode ainda não existir.
    let _currentStreamComponent = null;

    const applyMessageStreamOverride = (StreamClass) => {
      if (!StreamClass || StreamClass._avocadoStreamPatched) return;
      StreamClass._avocadoStreamPatched = true;

      extend(StreamClass.prototype, 'oninit', function () {
        _currentStreamComponent = this;
      });
      extend(StreamClass.prototype, 'onremove', function () {
        if (_currentStreamComponent === this) _currentStreamComponent = null;
      });

      override(StreamClass.prototype, 'view', function (original) {
        if (this.attrs.state?.isLoading?.()) {
          return <div className="MessageStream">{renderStreamSkeleton()}</div>;
        }
        return original();
      });

      extend(StreamClass.prototype, 'content', function (items) {
        if (!app.session.user?.canSendAnyMessage?.()) return items;

        const dialog = this.attrs.dialog;
        const scrollToBottom = () => {
          try {
            this.scrollToBottom();
          } catch (_) {}
        };
        const replyItem = (
          <div className="MessageStream-item" key="reply">
            <AvocadoInlineReply
              dialog={dialog}
              onSent={(response) => {
                const state = this.attrs.state;
                const dialog = this.attrs.dialog;
                // state.push() acrescenta a mensagem sem recarregar; refresh() só sem o push.
                try {
                  const msgId = response?.data?.id;
                  const msg = msgId ? app.store.getById('dialog-messages', msgId) : null;
                  if (msg && state.hasItems() && typeof state.push === 'function') {
                    state.push(msg);
                    // Mantém dialog.lastMessage em dia, para a lateral mostrar a última mensagem.
                    if (dialog.data?.relationships?.lastMessage) {
                      dialog.data.relationships.lastMessage.data = { type: 'dialog-messages', id: msg.id() };
                    }
                    setTimeout(scrollToBottom, 60);
                    m.redraw();
                  } else {
                    state.refresh().then(() => {
                      setTimeout(scrollToBottom, 60);
                      m.redraw();
                    });
                  }
                } catch (_) {
                  state.refresh().then(() => {
                    setTimeout(scrollToBottom, 60);
                    m.redraw();
                  });
                }
              }}
            />
          </div>
        );

        // O ReplyPlaceholder é lazy no oninit do MessageStream, então no primeiro render
        // o item 'reply' não existe: troca se existir, senão acrescenta.
        const idx = items.findIndex((i) => i && i.key === 'reply');
        if (idx >= 0) items[idx] = replyItem;
        else items.push(replyItem);

        return items;
      });
    };

    const applyMessagesPageOverride = (MsgPage) => {
      if (!MsgPage || MsgPage._avocadoOverridden) return;
      MsgPage._avocadoOverridden = true;

      // O onupdate da extensão lê this.element.querySelector(...) e quebra antes de o
      // elemento existir (ex.: no skeleton).
      if (typeof MsgPage.prototype.onupdate === 'function') {
        const _origOnUpdate = MsgPage.prototype.onupdate;
        MsgPage.prototype.onupdate = function (vnode) {
          if (!this.element) return;
          try {
            _origOnUpdate.call(this, vnode);
          } catch (_) {}
        };
      }

      // Post--byCurrentUser nas mensagens do próprio usuário: a extensão usa
      // attrs.message, não attrs.post, e o core nunca põe a classe.
      const patchMessageClass = () => {
        try {
          const MessageClass = flarum.reg.get('flarum-messages', 'forum/components/Message');
          if (MessageClass && !MessageClass._avocadoPatched) {
            extend(MessageClass.prototype, 'classes', function (classes) {
              const msg = this.attrs.message;
              if (msg && app.session.user) {
                const msgUserId = msg.user?.()?.id?.() ?? msg.attribute?.('userId');
                const meId = app.session.user.id?.();
                if (msgUserId && meId && String(msgUserId) === String(meId)) {
                  if (!classes.includes('Post--byCurrentUser')) classes.push('Post--byCurrentUser');
                }
              }
              // Agrupamento estilo messenger: Post--grouped quando a mensagem anterior é do
              // mesmo usuário, para o CSS esconder avatar e nome repetidos.
              const prevMsg = this.attrs.prevMessage;
              if (prevMsg && msg) {
                const thisSender = String(msg.user?.()?.id?.() ?? msg.attribute?.('userId') ?? '');
                const prevSender = String(prevMsg.user?.()?.id?.() ?? prevMsg.attribute?.('userId') ?? '');
                if (thisSender && prevSender && thisSender === prevSender) {
                  if (!classes.includes('Post--grouped')) classes.push('Post--grouped');
                }
              }
              if (msg) {
                const isDeleted = !!(msg.isHidden?.() || msg.attribute?.('isHidden') || msg.attribute?.('hiddenAt') || msg.attribute?.('deletedAt'));
                const hasContent = !!(msg.contentHtml?.() || msg.attribute?.('content'));
                if (isDeleted || !hasContent) {
                  if (!classes.includes('Post--deleted')) classes.push('Post--deleted');
                }
              }
            });

            // Mensagem apagada/oculta: o corpo vira o placeholder, pelo ItemList do corpo.
            extend(MessageClass.prototype, 'view', function (vdom) {
              const msg = this.attrs.message;
              if (!msg) return;
              const isDeleted = !!(msg.isHidden?.() || msg.attribute?.('isHidden') || msg.attribute?.('hiddenAt') || msg.attribute?.('deletedAt'));
              const hasContent = !!(msg.contentHtml?.() || msg.attribute?.('content'));
              if (!isDeleted && hasContent) return;

              const replace = (node: any): boolean => {
                if (!node || typeof node !== 'object') return false;
                if (Array.isArray(node)) {
                  node.forEach(replace);
                  return false;
                }
                const cls = node.attrs?.className;
                if (typeof cls === 'string' && cls.split(' ').includes('Post-body')) {
                  node.children = [
                    <span key="deleted" className="AvocadoMessages-deletedNotice">
                      <i className="fas fa-ban" aria-hidden="true" /> {trans('ramon-avocado.forum.messages.deleted_message', 'Mensagem apagada')}
                    </span>,
                  ];
                  return true;
                }
                if (Array.isArray(node.children)) return node.children.some(replace);
                return false;
              };
              replace(vdom);
            });

            // Botão Citar em cada mensagem, com o [quote=name]...[/quote] padrão do Flarum
            // para o flarum-mentions/bbcode renderizarem certo.
            extend(MessageClass.prototype, 'actionItems', function (items) {
              const msg = this.attrs.message;
              if (!msg) return;
              if (!app.session.user?.canSendAnyMessage?.()) return;
              if (items.has?.('quote')) return;

              items.add(
                'quote',
                <Button
                  className="Button Button--link AvocadoMessages-quoteBtn"
                  icon="fas fa-reply"
                  onclick={() => {
                    const author = displayName(msg.user?.()) || msg.user?.()?.username?.() || '';
                    // O markdown cru preserva a formatação na citação; sem ele, o texto puro.
                    const content = msg.attribute?.('content') ?? msg.contentPlain?.() ?? '';
                    if (_currentInlineReply) {
                      _currentInlineReply.insertQuote(content, author);
                    }
                  }}
                  aria-label={app.translator.trans('flarum-mentions.forum.post.reply_link', {}, true) || 'Reply'}
                  title={app.translator.trans('flarum-mentions.forum.post.reply_link', {}, true) || 'Reply'}
                >
                  {app.translator.trans('flarum-mentions.forum.post.reply_link', {}, true) || 'Reply'}
                </Button>,
                50
              );
            });

            MessageClass._avocadoPatched = true;
          }
          const StreamClass = flarum.reg.get('flarum-messages', 'forum/components/MessageStream');
          applyMessageStreamOverride(StreamClass);
        } catch (_) {}
      };

      // No módulo, para sobreviver à remontagem do componente.
      let _msgPageFullyLoaded = false;

      // ── Mobile: don't auto-select first dialog (let user pick) ────────────
      const _origInitDialog = MsgPage.prototype.initDialog;
      MsgPage.prototype.initDialog = async function () {
        const isMobile = window.innerWidth < 768;
        if (isMobile && !m.route.param('id')) {
          const title = app.translator.trans('flarum-messages.forum.messages_page.title', {}, true);
          this.selectedDialog(null);
          this.currentDialogId = null;
          app.setTitle(title);
          m.redraw();
          return;
        }
        try {
          await _origInitDialog.call(this);
          // O diálogo pode estar no store sem os usuários (ex.: recém-criado pelo
          // MessageComposer): busca de novo com eles.
          const dialog = this.selectedDialog?.();
          if (dialog && (!dialog.users() || dialog.users().length === 0)) {
            const fresh = await app.store.find('dialogs', dialog.id(), { include: 'users.groups' });
            if (fresh) {
              this.selectedDialog(fresh);
              m.redraw();
            }
          }
        } finally {
          _msgPageFullyLoaded = true;
          m.redraw();
        }
      };

      // ── Chat-switch skeleton (mimics discussion post skeleton) ──────────────
      const renderDialogSwitchSkeleton = () => (
        <div className="AvocadoMessages-skeleton-dialog">
          <div className="AvocadoMessages-skeleton-dialog-header">
            <div className="AvocadoMessages-skeleton-avatar" />
            <div className="AvocadoMessages-skeleton-dialog-header-info">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--name" />
            </div>
          </div>
          {[
            { out: false, w1: '55%', w2: '40%' },
            { out: true, w1: '45%', w2: null },
            { out: false, w1: '60%', w2: '35%' },
            { out: true, w1: '50%', w2: '30%' },
            { out: false, w1: '40%', w2: null },
            { out: true, w1: '65%', w2: '20%' },
          ].map((row, i) => (
            <div key={i} className={'AvocadoMessages-skeleton-dialog-msg' + (row.out ? ' is-out' : '')}>
              {!row.out && <div className="AvocadoMessages-skeleton-avatar AvocadoMessages-skeleton-avatar--sm" />}
              <div className="AvocadoMessages-skeleton-dialog-bubble-wrap">
                <div className="AvocadoMessages-skeleton-dialog-bubble" style={`width:${row.w1}`} />
                {row.w2 && <div className="AvocadoMessages-skeleton-dialog-bubble" style={`width:${row.w2}`} />}
              </div>
              {row.out && <div className="AvocadoMessages-skeleton-avatar AvocadoMessages-skeleton-avatar--sm" />}
            </div>
          ))}
        </div>
      );

      // ── Skeleton helpers ────────────────────────────────────────────────────
      const renderMsgListSkeleton = () => (
        <div className="AvocadoMessages-skeleton-list">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="AvocadoMessages-skeleton-item">
              <div className="AvocadoMessages-skeleton-avatar" />
              <div className="AvocadoMessages-skeleton-body">
                <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--name" />
                <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--msg" />
              </div>
            </div>
          ))}
        </div>
      );

      const renderMsgChatSkeleton = () => (
        <div className="AvocadoMessages-skeleton-chat">
          <div className="AvocadoMessages-skeleton-bubble AvocadoMessages-skeleton-bubble--in">
            <div className="AvocadoMessages-skeleton-avatar" />
            <div className="AvocadoMessages-skeleton-bubble-body">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--name" />
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-lg" />
            </div>
          </div>
          <div className="AvocadoMessages-skeleton-bubble AvocadoMessages-skeleton-bubble--out">
            <div className="AvocadoMessages-skeleton-bubble-body">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-md" />
            </div>
            <div className="AvocadoMessages-skeleton-avatar" />
          </div>
          <div className="AvocadoMessages-skeleton-bubble AvocadoMessages-skeleton-bubble--in">
            <div className="AvocadoMessages-skeleton-avatar" />
            <div className="AvocadoMessages-skeleton-bubble-body">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-sm" />
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-lg" />
            </div>
          </div>
          <div className="AvocadoMessages-skeleton-bubble AvocadoMessages-skeleton-bubble--out">
            <div className="AvocadoMessages-skeleton-bubble-body">
              <div className="AvocadoMessages-skeleton-line AvocadoMessages-skeleton-line--bubble-sm" />
            </div>
            <div className="AvocadoMessages-skeleton-avatar" />
          </div>
        </div>
      );

      // ── Compose button in toolbar actionItems ────────────────────────────────
      extend(MsgPage.prototype, 'actionItems', function (items) {
        if (!app.session.user?.canSendAnyMessage?.()) return;
        items.add(
          'newMessage',
          <button
            type="button"
            className="Button Button--icon AvocadoMessages-composeBtn"
            aria-label={app.translator.trans('flarum-messages.forum.messages_page.send_message_button')}
            title={app.translator.trans('flarum-messages.forum.messages_page.send_message_button')}
            onclick={() => {
              const SidebarClass = flarum.reg.get('flarum-messages', 'forum/components/MessagesSidebar');
              if (SidebarClass?.prototype?.newMessageAction) {
                SidebarClass.prototype.newMessageAction.call({});
                return;
              }
              document.querySelector('.MessagesPage-newMessage')?.click();
            }}
          >
            <i className="icon fas fa-edit Button-icon" aria-hidden="true" />
            <span className="Button-label" />
          </button>,
          30
        );
      });

      override(MsgPage.prototype, 'view', function () {
        patchMessageClass();

        // Skeleton inteiro só na primeira carga, antes de qualquer diálogo.
        const isLoading = app.dialogs.isLoading() && !_msgPageFullyLoaded;

        // Skeleton de troca sempre que o id da URL difere do diálogo carregado; é
        // síncrono, sem flag.
        const routeId = String(m.route.param('id') ?? '');
        const loadedId = String(this.selectedDialog?.()?.id?.() ?? '');
        const isSwitching = !isLoading && !!routeId && routeId !== loadedId;

        const hasDialog = (!!this.selectedDialog?.() || isSwitching) && !isLoading;
        const cardClass = 'AvocadoMessages-card' + (hasDialog ? ' AvocadoMessages-card--onDialog' : '');

        const items = this.contentItems();
        // O flarum/messages só adiciona 'dialog' quando há conversa aberta (ou
        // carregando); ItemList.get() de uma chave ausente lança TypeError.
        const sidebarVnode = items.has('sidebar') ? items.get('sidebar') : null;
        const dialogVnode = items.has('dialog') ? items.get('dialog') : null;

        // `key` atrelada ao id do diálogo força o Mithril a recriar o componente, e o
        // MessageStream.oncreate() roda a cada troca.
        const dialogId = this.selectedDialog?.()?.id?.();
        const forceRecreatKey = isLoading ? 'loading' : isSwitching ? 'switching' : `dialog-${dialogId}`;

        if (dialogVnode && !isLoading && !isSwitching) {
          dialogVnode.key = forceRecreatKey;
        }

        const self = this;
        const handleBackClick = (e) => {
          if (e.target.closest('.DialogSection-back')) {
            e.preventDefault();
            e.stopPropagation();
            self.selectedDialog(null);
            self.currentDialogId = null;
            const title = app.translator.trans('flarum-messages.forum.messages_page.title', {}, true);
            app.setTitle(title);
            // Volta à rota base, para o initDialog não reabrir a conversa anterior.
            try {
              m.route.set(app.route('messages'));
            } catch (_) {
              m.route.set('/messages');
            }
          }
        };

        return (
          <div
            className="AvocadoMessages MessagesPage"
            // A toolbar é do flarum-messages e o título dela é desenhado por
            // ::before no nosso LESS. Passamos o texto já traduzido — com a
            // chave da própria extensão — para não haver string fixa no CSS.
            style={`--avocado-messages-title: ${cssString(
              String(app.translator.trans('flarum-messages.forum.messages_page.title', {}, true) ?? '')
            )}`}
          >
            <div className="AvocadoNav-helper">
              <IndexSidebar key={m.route.get()} />
            </div>
            <div className={cardClass}>
              <div className="AvocadoMessages-listCol">{isLoading ? renderMsgListSkeleton() : sidebarVnode}</div>
              <div className="AvocadoMessages-chatCol" onclick={handleBackClick}>
                {isLoading ? renderMsgChatSkeleton() : isSwitching ? renderDialogSwitchSkeleton() : dialogVnode}
              </div>
            </div>
          </div>
        );
      });

      // ── Guard and verify realtime listeners are active (fallback) ────────────
      // Garante os canais caso o oncreate não rode.
      extend(MsgPage.prototype, 'onupdate', function () {
        if (!app.websocket || !app.session.user) return;
        if (!app.websocket_channels) app.websocket_channels = {};
        if (!app.websocket_channels.user) {
          try {
            console.log('[Avocado] Fallback: Creating user channel subscription');
            app.websocket_channels.user = app.websocket.subscribe(`private-user=${app.session.user.id()}`);
          } catch (err) {
            console.warn('[Avocado] Failed to subscribe to user channel:', err);
          }
        }
      });
    };

    // Caso A: o chunk já carregou.
    const MsgPageSync = flarum.reg.get('flarum-messages', 'forum/components/MessagesPage');
    if (MsgPageSync) {
      applyMessagesPageOverride(MsgPageSync);
    } else {
      // Caso B: chunk lazy; intercepta o flarum.reg.add() no momento em que ele
      // registra o componente.
      const _origRegAdd = flarum.reg.add.bind(flarum.reg);
      flarum.reg.add = function (extId, compName, comp) {
        _origRegAdd(extId, compName, comp);
        if (extId === 'flarum-messages' && compName === 'forum/components/MessagesPage') {
          applyMessagesPageOverride(comp);
          // Restaura o original para não interceptar chamadas alheias para sempre.
          flarum.reg.add = _origRegAdd;
        }
      };
    }

    // ── Contadores do usuário sem websocket (fallback leve) ───────────────
    // Com o flarum/realtime ativo não há polling: as notificações chegam pelo canal
    // private-user e o Pusher reconecta sozinho. Sem ele fica um fallback barato:
    // só com a aba visível, só os contadores (sparse fieldset), de 1 em 1 min,
    // dobrando até 5 min enquanto nada muda. A lista de conversas fica com o
    // DialogListState do flarum/messages, que recarrega quando `messageCount` muda.
    if (!realtimeAvailable()) {
      const MIN_MS = 60_000;
      const MAX_MS = 300_000;
      const FIELDS = ['unreadNotificationCount', 'newNotificationCount', 'messageCount'];
      let delay = MIN_MS;
      let timer: number | undefined;
      let lastPoll = Date.now();

      const snapshot = (user: any) => FIELDS.map((f) => user?.attribute?.(f)).join('|');

      const schedule = () => {
        window.clearTimeout(timer);
        timer = document.hidden ? undefined : window.setTimeout(poll, delay);
      };

      const poll = () => {
        const user = app.session?.user;
        if (document.hidden || !user) return;
        lastPoll = Date.now();
        const before = snapshot(user);

        app
          .request({
            method: 'GET',
            url: `${app.forum.attribute('apiUrl')}/users/${user.id()}`,
            params: { fields: { users: FIELDS.join(',') } },
            errorHandler: () => {},
          })
          .then((payload: any) => {
            app.store.pushPayload(payload);
            const changed = snapshot(user) !== before;
            delay = changed ? MIN_MS : Math.min(delay * 2, MAX_MS);
            if (changed) m.redraw();
          })
          .catch(() => {
            delay = Math.min(delay * 2, MAX_MS);
          })
          .finally(schedule);
      };

      if (app.session?.user) {
        schedule();
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            window.clearTimeout(timer);
            timer = undefined;
            return;
          }
          // Voltou para a aba: atualiza já se faz tempo, e recomeça do intervalo mínimo.
          delay = MIN_MS;
          if (Date.now() - lastPoll >= MIN_MS) poll();
          else schedule();
        });
      }
    }

    // ── flarum/realtime — custom event handlers ──────────────────────────
    // Assina direto em app.websocket em vez dos callbacks do RealtimeState: o
    // notifyPublicChannelReady só roda para guests, e assinar direto funciona mesmo
    // antes do boot do flarum/realtime. Canais: `public` e `private-user={id}`.
    // likesMutation e discussionPinned vêm nos dois; as mensagens só no privado.
    (() => {
      const EV_MSG_CREATED = 'Flarum\\Messages\\DialogMessage\\Event\\Created';
      const EV_MSG_UPDATED = 'Flarum\\Messages\\DialogMessage\\Event\\Updated';

      const onPayload = (data) => {
        try {
          if (data) app.store.pushPayload(data);
        } catch (_) {}
        m.redraw();
      };

      const onDialog = (data) => {
        // Só atualiza o store: o extendRealtime do flarum/messages já chama
        // state.push(message) e app.dialogs.refresh(), e um load/refresh aqui
        // recarregaria o stream inteiro (o "congelamento").
        try {
          if (data) app.store.pushPayload(data);
        } catch (_) {}
        m.redraw();
      };

      const bindChannels = () => {
        try {
          if (!app.websocket) return false;

          // Canal público: guests, e reserva para quem está logado.
          const pub = app.websocket.subscribe('public');
          if (!pub._avBound) {
            pub._avBound = true;
            pub.bind('likesMutation', onPayload);
            pub.bind('discussionPinned', onPayload);
          }

          // Canal do usuário: payload personalizado para quem está logado.
          if (app.session?.user) {
            const priv = app.websocket.subscribe(`private-user=${app.session.user.id()}`);
            if (!priv._avBound) {
              priv._avBound = true;
              priv.bind('likesMutation', onPayload);
              priv.bind('discussionPinned', onPayload);
              priv.bind(EV_MSG_CREATED, onDialog);
              priv.bind(EV_MSG_UPDATED, onDialog);
            }
            // Religa o handler do MessageStream do flarum/messages com o canal pronto: o
            // oncreate liga por optional chaining e, sem canal na montagem, não liga nada.
            try {
              const comp = _currentStreamComponent;
              if (comp && typeof comp.messageCreatedHandler === 'function') {
                priv.unbind(EV_MSG_CREATED, comp.messageCreatedHandler);
                priv.bind(EV_MSG_CREATED, comp.messageCreatedHandler);
              }
            } catch (_) {}
          }

          // Avisa também o RealtimeState, para os outros consumidores do flarum/realtime.
          const rs = flarum.reg.get('flarum-realtime', 'forum/RealtimeState');
          if (rs && !rs._avocadoNotified) {
            rs._avocadoNotified = true;
            if (app.websocket_channels) {
              if (app.websocket_channels.public) rs.notifyPublicChannelReady?.(app.websocket_channels.public);
              if (app.websocket_channels.user) rs.notifyUserChannelReady?.(app.websocket_channels.user);
            }
          }

          return true;
        } catch (_) {
          return false;
        }
      };

      // Sem o realtime não há socket para esperar.
      if (!realtimeAvailable()) return;

      // O realtime cria app.websocket num extend de Application.mount, que o boot
      // chama logo depois dos initializers. Fazemos o mesmo extend e adiamos para
      // a microtask seguinte: o mount é síncrono, então ali todos os extends dele
      // (inclusive o do realtime, registrado antes ou depois do nosso) já rodaram
      // e o socket existe — sem polling.
      extend(Application.prototype as any, 'mount', () => {
        queueMicrotask(() => {
          if (bindChannels()) return;
          // Rede de segurança: falha pontual no subscribe — tenta poucas vezes.
          let tries = 0;
          const timer = window.setInterval(() => {
            if (bindChannels() || ++tries >= 10) window.clearInterval(timer);
          }, 1000);
        });
      });
    })();

    // ── DiscussionListItem infoItems (excerpt) ────────────────────────────
    extend(DiscussionListItem.prototype, 'infoItems', function (items) {
      if (!items.has('excerpt')) {
        const firstPost = this.attrs.discussion.firstPost?.();
        if (firstPost) {
          const plain = firstPost.contentPlain?.() || '';
          if (plain) items.add('excerpt', <div>{truncate(plain, 175)}</div>, -100);
        }
      }
    });

    // ── Phone: no dropdown flash before the notifications page ────────────
    // Com o drawer aberto o HeaderDropdown.onclick() do core navega para a página
    // inteira, mas o botão ainda tem o data-toggle="dropdown" do Bootstrap e o
    // painel aparece por um quadro. Parar a propagação aqui (fase do alvo, antes do
    // handler no document) deixa só a troca de rota.
    override(HeaderDropdown.prototype, 'onclick', function (original, e) {
      if (!app.drawer?.isOpen?.()) return original(e);

      e?.preventDefault?.();
      e?.stopPropagation?.();
      this.goToRoute();
    });

    // ── Colored integration ───────────────────────────────────────────────────
    // A cor da primeira tag vale para a página inteira, por variáveis CSS no
    // <body>; as regras ficam em forum/colored.less.

    app.beforeMount(() => {
      const enabled = !!app.forum.attribute<boolean>('avocadoColoredEnabled');
      const borderStyle = enabled ? app.forum.attribute<string>('avocadoColoredBorderStyle') || 'none' : 'none';
      document.documentElement.setAttribute('data-avocado-colored-border', borderStyle);
      // O cabeçalho colorido segue o data-colored-header do próprio Flarum
      // (FrontendServiceProvider); não precisa de atributo do tema.
    });

    // --item-tag-color para as bordas nativas da lista, e a cor aplicada no clique
    // para a discussão já abrir colorida.
    extend(DiscussionListItem.prototype, 'view', function (vdom) {
      const tags = sortTagsSafe((this.attrs.discussion?.tags?.() as any[]) || []);
      const color: string | null = tags.length ? (tags[0] as any).color?.() : null;
      if (!color || !vdom?.attrs) return;

      vdom.attrs.style = { ...(vdom.attrs.style || {}), '--item-tag-color': color };

      if (!app.forum.attribute<boolean>('avocadoColoredEnabled')) return;
      const prev = vdom.attrs.onclick;
      vdom.attrs.onclick = (e: MouseEvent) => {
        applyColor(color);
        if (typeof prev === 'function') (prev as Function).call(this, e);
      };
    });

    // Aplica a cor ao entrar na discussão e limpa ao sair (sem transição, ver applyColor).
    extend(DiscussionHero.prototype, 'oninit', function () {
      if (!app.forum.attribute<boolean>('avocadoColoredEnabled')) return;
      const tags = sortTagsSafe((this.attrs.discussion?.tags?.() as any[]) || []);
      applyColor(tags.length ? (tags[0] as any).color?.() : null);
    });
    extend(DiscussionHero.prototype, 'onupdate', function () {
      if (!app.forum.attribute<boolean>('avocadoColoredEnabled')) return;
      const tags = sortTagsSafe((this.attrs.discussion?.tags?.() as any[]) || []);
      applyColor(tags.length ? (tags[0] as any).color?.() : null);
    });
    extend(DiscussionHero.prototype, 'onremove', function () {
      clearColor();
    });
  },
  -10
);

// ─── fof/reactions: suppress "Your reaction was converted" warning ─────────────
// A extensão mostra esse aviso ao remover uma reação com gamification/likes, e
// ele quebra a experiência. O filtro fica no app.alerts.show, chamado raramente,
// e não no app.translator.trans, a função mais quente do front. O aviso é
// reconhecido pelo texto: a tradução crua vira uma regex (placeholders ICU viram
// curinga) comparada via extractText, que aceita string e vnodes.
app.initializers.add(
  'avocado-suppress-reaction-converted-warning',
  () => {
    if (!('fof-reactions' in flarum.extensions)) return;
    const SUPPRESS_KEY = 'fof-reactions.forum.warning';
    let matcher: RegExp | null | undefined;

    const isSuppressed = (children: any): boolean => {
      if (matcher === undefined) {
        const raw = (app.translator as any).translations?.[SUPPRESS_KEY];
        matcher =
          typeof raw === 'string' && raw
            ? new RegExp(
                '^' +
                  raw
                    .split(/\{[^}]*\}/)
                    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('.*') +
                  '$',
                's'
              )
            : null;
      }
      if (!matcher) return false;
      return matcher.test(extractText(children).trim());
    };

    const _show = app.alerts.show.bind(app.alerts);
    // Repassa todos os argumentos: show() também aceita (componente, attrs, filhos).
    (app.alerts as any).show = function (...args: any[]) {
      if (args[0]?.type === 'warning' && isSuppressed(args[1])) return;
      return (_show as any)(...args);
    };
  },
  -200
);

// ── Botão "Responder" do flarum/mentions sem rejeição solta ───────────────────
// O `reply()` do flarum/mentions encadeia `.then()` na ação de responder do core
// sem tratar a rejeição, e o core rejeita de propósito quando não há o que abrir
// (visitante, ou quem recusa descartar a resposta aberta). Sobraria um
// "Uncaught (in promise)" no console. Prioridade baixa para rodar depois do
// initializer do flarum/mentions.
app.initializers.add(
  'avocado-mentions-reply-rejection',
  () => {
    extend(CommentPost.prototype, 'actionItems', function (items: any) {
      if (!items.has('reply')) return;

      const button: any = items.get('reply');
      const onclick = button?.attrs?.onclick;
      if (typeof onclick !== 'function') return;

      button.attrs.onclick = (e: MouseEvent) => {
        const result = onclick(e);
        if (result && typeof result.catch === 'function') result.catch(() => {});
        return result;
      };
    });
  },
  -200
);

// ── "Editar tags" abre o modal do tema ────────────────────────────────────────
// Prioridade baixa: roda depois do initializer do flarum/tags, que é quem põe o
// item "Editar tags" no menu da discussão (utils/tagsModal.ts troca o clique).
app.initializers.add('avocado-tags-modal', () => installTagsModal(), -200);

// ── Classes do backdrop por modal ─────────────────────────────────────────────
// Substituem os `body:has(.ModalManager …)` do LESS (ver utils/modalBackdrop.ts).
app.initializers.add('avocado-modal-backdrop', () => installModalBackdropClasses());
