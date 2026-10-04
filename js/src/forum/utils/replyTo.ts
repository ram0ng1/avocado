import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Avatar from 'flarum/common/components/Avatar';
import trustedHtml from '../../common/trustedHtml';

/**
 * "↳ Em resposta a [avatar] Nome", como no Waterhole — no post, na prévia e no
 * compositor.
 *
 * O Flarum não grava o "pai" de um post: responder a um post só insere a
 * menção `@"Nome"#p123` no COMEÇO do texto. É essa menção de abertura que vira
 * "Em resposta a" — e sai do texto, para não aparecer duas vezes:
 *  - no post publicado, a linha entra entre o cabeçalho e o corpo;
 *  - no compositor, a menção sai da textarea e vira um chip no cabeçalho
 *    ("↩ [avatar] Nome ×"); ao enviar ela volta para o começo do texto, então
 *    o conteúdo salvo é o mesmo de sempre e desligar a opção não muda nada;
 *  - na prévia ao vivo, a mesma linha do post publicado.
 *
 * Uma menção no meio do texto, menção a usuário e citação (blockquote) ficam
 * como sempre foram. Ligado pelo admin (aba Discussões, `avocado.reply_to_header`).
 */

interface ReplyParent {
  /** id do post respondido. */
  id: string;
  name: string;
  /** Link do post (do formatter); vazio no compositor, onde ele vem do store. */
  href: string;
}

interface ComposerReply extends ReplyParent {
  /** A menção exatamente como estava no texto, para devolver ao enviar. */
  raw: string;
}

const enabled = (): boolean => !!app.forum.attribute('avocadoReplyToHeader');

// ── Leitura ────────────────────────────────────────────────────────────────────

/** Menção de post logo na abertura do primeiro parágrafo (só espaço antes). */
const LEADING_MENTION_HTML = /^\s*<p>\s*(<a\b[^>]*\bclass="PostMention\b[^"]*"[^>]*>([\s\S]*?)<\/a>)[ \t]*(?:<br\s*\/?>)?\s*/;

/** A mesma menção no texto cru do compositor (formato do flarum/mentions). */
const LEADING_MENTION_SOURCE = /^@"((?:[^"\\]|\\.)+)"#p(\d+)[ \t]?/;

const attr = (tag: string, name: string): string => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : '';
};

/**
 * Texto puro do miolo da âncora (o formatter só põe o nome, mas sem confiar
 * nisso). DOMParser monta um documento inerte — não roda script nem carrega
 * nada —, ao contrário de jogar a string num elemento da página.
 */
const plainText = (html: string): string => (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').trim();

const parsePublished = (contentHtml: unknown): (ReplyParent & { rest: string }) | null => {
  if (typeof contentHtml !== 'string') return null;

  const match = contentHtml.match(LEADING_MENTION_HTML);
  if (!match) return null;

  const openTag = match[1].slice(0, match[1].indexOf('>') + 1);
  const id = attr(openTag, 'data-id');
  if (!id) return null;

  // A menção saiu; se o parágrafo dela ficou vazio, ele sai junto.
  const rest = ('<p>' + contentHtml.slice(match[0].length)).replace(/^<p>\s*<\/p>\s*/, '');

  return { id, href: attr(openTag, 'href'), name: plainText(match[2]), rest };
};

// ── Linha "Em resposta a" ──────────────────────────────────────────────────────

/** Autor do post respondido: pelo post no store; senão, pelo nome entre os usuários carregados. */
const parentUser = (parent: ReplyParent): any => {
  const post: any = app.store.getById('posts', parent.id);
  const user = post?.user?.();
  if (user) return user;
  return (app.store.all('users') as any[]).find((u) => u.displayName?.() === parent.name) || null;
};

const parentHref = (parent: ReplyParent): string => {
  if (parent.href) return parent.href;
  const post: any = app.store.getById('posts', parent.id);
  try {
    return post ? app.route.post(post) : '';
  } catch {
    return '';
  }
};

const parentItem = (id: string): HTMLElement | null => document.querySelector(`.PostStream-item[data-id="${CSS.escape(id)}"]`);

const highlight = (id: string, on: boolean): void => {
  parentItem(id)?.classList.toggle('AvocadoReplyTo-target', on);
};

/** Caminho interno de um link (o formatter grava a URL absoluta). */
const routePath = (href: string): string | null => {
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    const base = String(app.forum.attribute('basePath') || '');
    return url.pathname.slice(base.length) || '/';
  } catch {
    return null;
  }
};

const plainClick = (e: MouseEvent): boolean => !(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0);

const goToParent = (e: MouseEvent, parent: ReplyParent): void => {
  if (!plainClick(e)) return;
  e.preventDefault();
  highlight(parent.id, false);

  // Já na tela: rola até ele. Senão, a rota do post carrega o trecho certo.
  const item = parentItem(parent.id);
  if (item) {
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    item.classList.add('AvocadoReplyTo-flash');
    setTimeout(() => item.classList.remove('AvocadoReplyTo-flash'), 1600);
    return;
  }

  const href = parentHref(parent);
  const path = href && routePath(href);
  if (path) m.route.set(path);
  else if (href) window.location.href = href;
};

/** Seta "↳" (corner-down-right), o mesmo desenho do Waterhole. */
const cornerIcon = () =>
  m(
    'svg.AvocadoReplyTo-icon',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.75',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    m('path', { d: 'M6 6v6a3 3 0 0 0 3 3h10l-4 -4m0 8l4 -4' })
  );

/** A linha inteira é um link para o post respondido (o nome não leva ao perfil). */
export const replyLine = (parent: ReplyParent) => {
  const user = parentUser(parent);

  return m(
    'div.AvocadoReplyTo',
    m(
      'a.AvocadoReplyTo-link',
      {
        href: parentHref(parent) || undefined,
        onclick: (e: MouseEvent) => goToParent(e, parent),
        onmouseenter: () => highlight(parent.id, true),
        onmouseleave: () => highlight(parent.id, false),
      },
      [
        cornerIcon(),
        m('span.AvocadoReplyTo-label', app.translator.trans('ramon-avocado.forum.post.in_reply_to')),
        m('span.AvocadoReplyTo-user', [
          user ? m(Avatar, { user, className: 'AvocadoReplyTo-avatar' }) : null,
          m('span.AvocadoReplyTo-name', parent.name),
        ]),
      ]
    )
  );
};

// ── Compositor ─────────────────────────────────────────────────────────────────

/** Resposta em andamento do compositor aberto (o chip), se houver. */
const composerReply = (composer: any = app.composer): ComposerReply | null => composer?.fields?.avocadoReplyTo || null;

/**
 * Tira a menção de abertura da textarea e guarda no chip.
 *
 * Roda a cada mudança do texto. A menção chega por `insertMention` do
 * flarum/mentions (botão Responder, citar), por rascunho ou pelo conteúdo do
 * post em edição. Só a do começo vira chip; com o texto já começado, a menção
 * nova entra no cursor e fica no texto, como sempre.
 */
const absorbLeadingMention = (body: any): void => {
  const composer = body?.composer;
  const editor = composer?.editor;
  if (!enabled() || !composer?.fields?.content || !editor) return;

  const content = String(composer.fields.content() || '');
  const match = content.match(LEADING_MENTION_SOURCE);
  if (!match) return;

  const raw = match[0];
  composer.fields.avocadoReplyTo = { id: match[2], name: match[1].replace(/\\(.)/g, '$1'), href: '', raw } as ComposerReply;

  // O texto "original" é o que o fechar compara para perguntar se descarta. O
  // flarum/mentions grava a menção nele ao abrir uma resposta vazia, e a edição
  // grava o post inteiro; sem tirar dali também, fechar sem escrever nada
  // perguntaria se quer descartar.
  // Vale no estado do compositor (`composer.body.attrs`, onde o
  // flarum/mentions grava e de onde os attrs do componente são recriados a cada
  // render) e na cópia que o componente já tem.
  for (const attrs of [composer.body?.attrs, body.attrs]) {
    const original = attrs?.originalContent;
    if (typeof original === 'string' && original.startsWith(raw)) attrs.originalContent = original.slice(raw.length);
  }

  editor.insertBetween(0, raw.length, '', false);

  // `insertBetween` com texto vazio depende do navegador (execCommand); se a
  // menção ficou, a textarea do driver básico é ajustada direto.
  const el: HTMLTextAreaElement | undefined = editor.el;
  if (String(composer.fields.content() || '').startsWith(raw) && el && typeof el.value === 'string') {
    el.value = el.value.slice(raw.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  m.redraw();
};

/** Chip no cabeçalho do compositor: "↩ [avatar] Nome ×". */
const replyChip = (composer: any) => {
  const reply = composerReply(composer);
  if (!reply) return null;

  const user = parentUser(reply);

  return m('span.AvocadoReplyChip', [
    m('i.icon.fas.fa-reply.AvocadoReplyChip-icon', { 'aria-hidden': 'true' }),
    user ? m(Avatar, { user, className: 'AvocadoReplyChip-avatar' }) : null,
    m('span.AvocadoReplyChip-name', reply.name),
    m(
      'button.AvocadoReplyChip-remove',
      {
        type: 'button',
        'aria-label': app.translator.trans('ramon-avocado.forum.composer.remove_reply'),
        title: app.translator.trans('ramon-avocado.forum.composer.remove_reply'),
        // Desfaz a resposta: o texto já está sem a menção, ela só não volta ao enviar.
        onclick: () => {
          composer.fields.avocadoReplyTo = null;
          composer.editor?.focus?.();
        },
      },
      m('i.icon.fas.fa-times', { 'aria-hidden': 'true' })
    ),
  ]);
};

const installComposerBody = (Body: any): void => {
  extend(Body.prototype, 'oninit', function (this: any) {
    // O stream do texto avisa toda mudança; o editor só fica pronto depois do
    // 1º render, então a troca espera por ele.
    this.attrs.composer.fields.content.map(() => {
      if (!enabled()) return;
      Promise.resolve(this.attrs.composer.editorReady?.())
        .then(() => absorbLeadingMention({ composer: this.attrs.composer, attrs: this.attrs }))
        .catch(() => {});
    });
  });

  extend(Body.prototype, 'headerItems', function (this: any, items: any) {
    const chip = replyChip(this.attrs.composer);
    // Depois do título (prioridade 0 no ReplyComposer e no EditPostComposer).
    if (chip) items.add('avocadoReplyTo', chip, -10);
  });

  // Ao enviar, a menção volta ao começo: o post salvo é o mesmo de sempre.
  extend(Body.prototype, 'data', function (this: any, data: any) {
    const reply = composerReply(this.attrs.composer);
    if (reply && data && typeof data.content === 'string') data.content = reply.raw + data.content;
  });
};

// ── Prévia ao vivo da resposta (placeholder do fim da discussão) ───────────────

/**
 * A prévia da resposta é o `<article>` da ReplyPlaceholder. A linha entra num
 * contêiner próprio, montado com m.render, no topo do `.Post-body` dela — o
 * único filho Mithril ali é a ComposerPostPreview, que desenha o próprio HTML.
 * Inserir direto no `.Post-main` (lista que o Mithril reordena) quebrava o
 * render dele; e um `extend` na view da placeholder não pegava (outra extensão
 * envolve a mesma view).
 */
const syncPreviewLine = (el: Element | null): void => {
  if (!el || el.tagName !== 'ARTICLE') return;

  const body = el.querySelector('.Post-main > .Post-body');
  if (!body) return;

  let slot = body.querySelector<HTMLElement>(':scope > .AvocadoReplyTo-slot');
  const reply = enabled() ? composerReply() : null;

  if (!reply) {
    if (slot) {
      m.render(slot, null);
      slot.remove();
    }
    return;
  }

  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'AvocadoReplyTo-slot';
    body.insertBefore(slot, body.firstChild);
  }
  m.render(slot, replyLine(reply));
};

// ── Instalação ─────────────────────────────────────────────────────────────────

export default function installReplyTo(): void {
  // Post publicado (e post em edição, cuja prévia é o próprio Comment).
  flarum.reg.onLoad('core', 'forum/components/Comment', (Comment: any) => {
    extend(Comment.prototype, 'view', function (this: any, vnodes: any) {
      if (!enabled() || !Array.isArray(vnodes)) return;

      if (this.attrs.isEditing) {
        const reply = composerReply();
        if (reply) vnodes.splice(1, 0, replyLine(reply));
        return;
      }

      // Com busca destacada o corpo não é o HTML puro.
      if (this.attrs.search) return;

      const parent = parsePublished(this.attrs.contentHtml);
      if (!parent) return;

      const body = vnodes[1];
      if (!body || !Array.isArray(body.children)) return;

      // Mesmo HTML que o core confia (renderizado e sanitizado pelo s9e no
      // servidor), só sem a menção de abertura.
      body.children = [trustedHtml(parent.rest)];
      vnodes.splice(1, 0, replyLine(parent));
    });
  });

  // Responder e editar: os dois corpos de compositor que levam menção a post.
  flarum.reg.onLoad('core', 'forum/components/ReplyComposer', installComposerBody);
  flarum.reg.onLoad('core', 'forum/components/EditPostComposer', installComposerBody);

  flarum.reg.onLoad('core', 'forum/components/ReplyPlaceholder', (ReplyPlaceholder: any) => {
    // `vnode.dom`, não `this.element`: o Component só grava o elemento no
    // oncreate, e a placeholder troca de raiz (botão ↔ <article>) sem recriar.
    extend(ReplyPlaceholder.prototype, ['oncreate', 'onupdate'], function (this: any, _ret: unknown, vnode: any) {
      syncPreviewLine(vnode?.dom || this.element);
    });
  });
}
