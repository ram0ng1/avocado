import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import TextEditor from 'flarum/common/components/TextEditor';
import { trans } from '../utils';

/**
 * Prévia dentro do compositor (opção do admin `avocado.composer_preview`).
 *
 * O compositor do core (responder, editar, nova discussão, mensagem) ganha o
 * mesmo botão de prévia do compositor da home: o olho troca o editor pelo post
 * formatado, no mesmo lugar. Em tela cheia o botão divide a tela — editor à
 * esquerda, prévia ao vivo à direita. Com isso a prévia que o core desenha no
 * fim da discussão enquanto se responde (a ReplyPlaceholder em modo
 * `CommentPost editing`) sai: a prévia passa a morar no compositor.
 *
 * Só o compositor do core (`attrs.composer === app.composer`): o da home tem a
 * sua prévia própria, e o chat não usa TextEditor com o app.composer.
 */

const enabled = (): boolean => !!app.forum?.attribute('avocadoComposerPreview');
/** Tela dividida só em tela cheia e de tablet para cima — no celular não cabe. */
const isSplit = (): boolean => (app.composer as any).position === 'fullScreen' && (window.matchMedia?.('(min-width: 768px)').matches ?? true);

/**
 * Estado do botão. A prévia começa desligada nos dois modos: fora da tela
 * cheia o botão a mostra no lugar do editor; em tela cheia, ao lado dele (tela
 * dividida). Vale para o que está sendo escrito agora — outro rascunho começa
 * do zero.
 */
const state = { body: null as unknown, inline: false, split: false };

const syncState = (): void => {
  const body = (app.composer as any).body;
  if (state.body !== body) Object.assign(state, { body, inline: false, split: false });
};

/** A prévia está à vista agora (pelo botão, ou pela tela cheia)? */
const isShown = (): boolean => {
  syncState();
  return isSplit() ? state.split : state.inline;
};

const toggle = (): void => {
  syncState();
  if (isSplit()) state.split = !state.split;
  else state.inline = !state.inline;
};

/**
 * Desenha `content` como post em `dom` — a mesma renderização da prévia do
 * compositor da home (s9e + visuals das extensões + reanimar stickers).
 * `stillActive` diz se a prévia continua aberta quando o ajuste tardio roda.
 */
export function renderPostPreview(dom: HTMLElement, content: string, stillActive: () => boolean = () => true): void {
  if (!content.trim()) {
    dom.replaceChildren();
    const empty = document.createElement('span');
    empty.className = 'AvocadoHome-composerPreviewEmpty';
    empty.textContent = trans('ramon-avocado.forum.home.composer_preview_empty', 'Nothing to preview.');
    dom.appendChild(empty);
    return;
  }

  const s9e = (window as any).s9e;
  if (!s9e?.TextFormatter?.preview) {
    dom.textContent = content;
    return;
  }

  s9e.TextFormatter.preview(content, dom);
  (app as any).visuals?.processPost?.(dom);
  // Stickers tgs/lottie dependem de um fetch tardio; clonar e trocar faz o
  // IntersectionObserver religar quando o canvas não chegou a ser criado.
  setTimeout(() => {
    if (!stillActive()) return;
    dom.querySelectorAll('.Sticker--tgs, .Sticker--lottie').forEach((el) => {
      if (el.querySelector('canvas')) return;
      const clone = el.cloneNode(true) as Element;
      clone.removeAttribute('data-tgs-init');
      clone.removeAttribute('data-lottie-init');
      el.parentNode?.replaceChild(clone, el);
    });
  }, 200);
}

/**
 * A área da prévia. O editor não redesenha a cada tecla (o core também lê o
 * conteúdo num intervalo, ver ComposerPostPreview), então ela confere o texto
 * a cada 120ms enquanto existe e só redesenha quando ele muda.
 */
const PreviewPane = {
  oncreate(vnode: any) {
    let last: string | undefined;
    const dom = vnode.dom as HTMLElement;
    const update = () => {
      const content = (app.composer as any).fields?.content?.() ?? '';
      if (content === last) return;
      last = content;
      renderPostPreview(dom, content, () => dom.isConnected);
    };
    update();
    vnode.state.timer = window.setInterval(update, 120);
  },
  onremove(vnode: any) {
    window.clearInterval(vnode.state.timer);
  },
  view() {
    return m('div.AvocadoComposerPreview.Post-body', { 'aria-live': 'polite' });
  },
};

export default function installComposerPreview(): void {
  extend(TextEditor.prototype, 'controlItems', function (this: any, items: any) {
    if (!enabled() || this.attrs.composer !== app.composer) return;

    const active = isShown();
    // No lugar do editor o botão volta a ele (lápis, como na home); na tela
    // dividida a prévia está ao lado e o botão a esconde (olho destacado).
    const inline = active && !isSplit();
    const label = inline
      ? trans('ramon-avocado.forum.home.composer_edit', 'Edit')
      : active
        ? trans('ramon-avocado.forum.composer.hide_preview', 'Hide preview')
        : trans('ramon-avocado.forum.home.composer_preview', 'Preview');

    items.add(
      'avocadoPreview',
      m(
        'button.Button.Button--icon.Button--link.AvocadoHome-composerPreviewBtn',
        {
          type: 'button',
          className: active ? 'is-active' : '',
          'aria-label': label,
          'aria-pressed': active ? 'true' : 'false',
          title: label,
          onclick: (e: Event) => {
            e.preventDefault();
            toggle();
          },
        },
        m('i', { 'aria-hidden': 'true', className: inline ? 'icon fas fa-pen' : 'icon far fa-eye' })
      ),
      -50
    );
  });

  extend(TextEditor.prototype, 'view', function (this: any, vnode: any) {
    if (!enabled() || this.attrs.composer !== app.composer || !vnode?.attrs) return;

    const shown = isShown();
    const mode = shown ? (isSplit() ? ' is-split' : ' is-previewing') : '';
    vnode.attrs.className = `${vnode.attrs.className || ''} AvocadoPreviewable${mode}`;

    // Logo depois do editor: no lugar dele (is-previewing) ou ao lado (is-split).
    if (shown && Array.isArray(vnode.children)) vnode.children.splice(1, 0, m(PreviewPane as any));
  });

  // A prévia no fim da discussão sai. Enquanto se responde a esta discussão a
  // caixa do fim some (um "Escreva uma resposta…" em cima do compositor já
  // aberto seria redundante); fechado o compositor, ela volta.
  override('flarum/forum/components/ReplyPlaceholder', 'view', function (this: any, original: () => any) {
    if (!enabled()) return original();
    if ((app.composer as any).composingReplyTo?.(this.attrs.discussion)) return m('div.ReplyPlaceholder-composing', { hidden: true });
    return original();
  });
}
