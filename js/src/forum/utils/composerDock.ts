import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import Avatar from 'flarum/common/components/Avatar';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';

/**
 * Compositor flutuante (Composer.less): o compositor nativo vira um cartão
 * alinhado à coluna de posts, e uma pílula "Escreva uma resposta…" fica na base
 * da tela em toda a discussão.
 *
 * Pílula própria porque o PostStream só desenha a ReplyPlaceholder com o fim da
 * discussão carregado. Ela fica no .App-composer e some quando a placeholder do
 * fim entra na tela. Só posição e estado ficam aqui; o visual é CSS e o fluxo
 * (minimizar, tela cheia, fechar, alça, prévia) continua o do core.
 */

/** Distância da pílula até a base da tela; espelha @composer-gap no Composer.less. */
const DOCK_GAP = 16;

/**
 * Opção do admin (Aparência › "Bolha de resposta flutuante"). Desligada, o
 * compositor e a placeholder do fim voltam a ser os do core — o CSS todo do
 * Composer.less depende da classe `avocado-reply-dock` no <html>.
 */
const dockEnabled = (): boolean => !!app.forum?.attribute('avocadoReplyDockEnabled');

/** A placeholder do fim da discussão está na tela (a pílula fixa cede o lugar). */
let endPlaceholderVisible = false;

/**
 * Alinha o cartão e a pílula à coluna de posts, quando há uma. Mede em vez de
 * espelhar breakpoints: a coluna muda com a largura, a nav lateral e o painel
 * fixado, e as margens fixas do Composer.less do core não servem ao layout do
 * tema. Sem coluna (perfil, configurações) o CSS centraliza o cartão.
 */
const syncColumn = (): void => {
  const host = document.querySelector<HTMLElement>('.App-composer');
  if (!host) return;

  // Na discussão, a coluna de posts; nas listas (tag, home, /discussions), a
  // pilha de discussões — o mesmo alinhamento da coluna de leitura da página.
  const column =
    document.querySelector<HTMLElement>('.DiscussionPage .PostStream') || document.querySelector<HTMLElement>('.AvocadoHome-threadStack');
  const rect = column?.getBoundingClientRect();

  if (!rect || rect.width === 0) {
    host.style.removeProperty('--avocado-composer-left');
    host.style.removeProperty('--avocado-composer-width');
    return;
  }

  const left = Math.round(rect.left - host.getBoundingClientRect().left);
  host.style.setProperty('--avocado-composer-left', `${left}px`);
  host.style.setProperty('--avocado-composer-width', `${Math.round(rect.width)}px`);
};

let frame = 0;
const scheduleSync = (): void => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    syncColumn();
  });
};

/** Visitante não escreve: a pílula convida a entrar, não "Escreva uma resposta…". */
const guestLabel = () => app.translator.trans('ramon-avocado.forum.composer.guest_pill');
const guestIcon = () => m('i.icon.far.fa-comment.AvocadoReplyDock-guestIcon', { 'aria-hidden': 'true' });

/**
 * Visitante: troca, na placeholder do fim, o avatar e o convite pelo ícone e o
 * texto de entrar, iguais aos da pílula fixa. Feito no DOM depois do render: um
 * `extend` em `view` chega tarde na cadeia (outra extensão envolve a mesma
 * view). O Mithril não mexe nesses nós enquanto o vnode deles não muda.
 */
const guestifyPlaceholder = (el: Element | null): void => {
  if (!dockEnabled() || app.session.user || !el || el.tagName !== 'BUTTON') return;

  const side = el.querySelector('.Post-side');
  if (side && !side.querySelector('.AvocadoReplyDock-guestIcon')) {
    const icon = document.createElement('i');
    icon.className = 'icon far fa-comment AvocadoReplyDock-guestIcon';
    icon.setAttribute('aria-hidden', 'true');
    side.replaceChildren(icon);
  }

  const header = el.querySelector('.Post-header');
  const label = String(guestLabel());
  if (header && header.textContent !== label) header.textContent = label;
};

/** Discussão da página atual, se a página for uma discussão. */
const currentDiscussion = (): any => {
  try {
    return (app.current as any)?.get?.('discussion') || null;
  } catch {
    return null;
  }
};

/**
 * A pílula fixa. Aparece numa discussão em que dá para responder (ou para o
 * visitante, que cai no login como na placeholder do core), enquanto o
 * compositor está fechado e a placeholder do fim não está à vista.
 */
const ReplyDock = {
  view() {
    if (!dockEnabled()) return null;

    const discussion = currentDiscussion();
    if (!discussion) return null;

    const user = app.session.user;
    if (user && !discussion.canReply?.()) return null;

    // Aberto, minimizado ou em tela cheia: o compositor já ocupa o lugar.
    const hidden = (app.composer as any).position !== 'hidden' || endPlaceholderVisible;

    return m(
      'button.AvocadoReplyDock',
      {
        type: 'button',
        className: hidden ? 'is-hidden' : '',
        'aria-hidden': hidden ? 'true' : undefined,
        tabindex: hidden ? -1 : undefined,
        onclick: () => {
          DiscussionControls.replyAction.call(discussion, true, false).catch(() => {});
        },
      },
      [
        user ? m(Avatar, { user, className: 'AvocadoReplyDock-avatar' }) : guestIcon(),
        m('span.AvocadoReplyDock-label', user ? app.translator.trans('core.forum.post_stream.reply_placeholder') : guestLabel()),
      ]
    );
  },
};

const mountDock = (): void => {
  const container = document.querySelector('.App-composer .container') || document.querySelector('.App-composer');
  if (!dockEnabled() || !container || document.getElementById('avocado-reply-dock')) return;

  const root = document.createElement('div');
  root.id = 'avocado-reply-dock';
  container.appendChild(root);
  m.mount(root, ReplyDock);
};

export default function installComposerDock(): void {
  // beforeMount: depois de app.forum existir e antes do primeiro render.
  app.beforeMount(() => {
    document.documentElement.classList.toggle('avocado-reply-dock', dockEnabled());
  });

  window.addEventListener('resize', scheduleSync, { passive: true });

  // Responder abre o compositor onde a pessoa está. Com `goToLast` a ação do core
  // carrega o fim da discussão e rola até lá para mostrar a prévia ao vivo; com o
  // cartão flutuando, ou a prévia no compositor, isso só faz perder o ponto da
  // leitura. Vale para todo mundo que chama a ação.
  override(DiscussionControls, 'replyAction', function (original, goToLast, forceRefresh) {
    const inPlace = dockEnabled() || !!app.forum?.attribute('avocadoComposerPreview');
    return original(inPlace ? false : goToLast, forceRefresh);
  });

  // A página de discussão monta a pílula (uma vez) e reposiciona a cada
  // redraw. O Composer é um chunk que o Flarum só carrega na primeira vez que
  // ele abre — por isso não dá para pendurar a montagem nele; dele vem só o
  // reposicionamento quando abre, minimiza ou muda de altura.
  flarum.reg.onLoad('core', 'forum/components/DiscussionPage', (DiscussionPage: any) => {
    extend(DiscussionPage.prototype, 'oncreate', () => {
      mountDock();
      scheduleSync();
    });
    extend(DiscussionPage.prototype, 'onupdate', scheduleSync);
  });
  flarum.reg.onLoad('core', 'forum/components/Composer', (Composer: any) => {
    extend(Composer.prototype, 'oncreate', scheduleSync);
    extend(Composer.prototype, 'onupdate', scheduleSync);
  });

  // A placeholder do fim: enquanto ela está na tela, a pílula fixa some e quem
  // fica é ela, parada no fim da lista como um post.
  flarum.reg.onLoad('core', 'forum/components/ReplyPlaceholder', (ReplyPlaceholder: any) => {
    extend(ReplyPlaceholder.prototype, 'oncreate', function (this: any) {
      const item = (this.element as HTMLElement | null)?.closest?.('.PostStream-item') as HTMLElement | null;
      if (!item || typeof IntersectionObserver === 'undefined') return;

      this.avocadoEndObserver = new IntersectionObserver(
        ([entry]) => {
          // "À vista" inclui já ter passado por ela: abaixo do fim da discussão
          // vem o rodapé, e a pílula fixa não deve voltar para flutuar em cima dele.
          const reached = entry.isIntersecting || entry.boundingClientRect.bottom < 0;
          if (endPlaceholderVisible === reached) return;
          endPlaceholderVisible = reached;
          m.redraw();
        },
        // Só conta como "à vista" depois de passar da linha da pílula fixa: a
        // troca acontece com as duas no mesmo lugar.
        { rootMargin: `0px 0px -${DOCK_GAP}px 0px` }
      );
      this.avocadoEndObserver.observe(item);
    });

    // Só o botão vira convite (a prévia ao vivo é um <article> e só existe com sessão).
    // `vnode.dom`, não `this.element`: o Component só grava o elemento no
    // oncreate, e a placeholder troca de raiz (botão ↔ prévia) sem recriar.
    extend(ReplyPlaceholder.prototype, ['oncreate', 'onupdate'], function (this: any, _ret: unknown, vnode: any) {
      guestifyPlaceholder(vnode?.dom || this.element);
    });

    extend(ReplyPlaceholder.prototype, 'onremove', function (this: any) {
      this.avocadoEndObserver?.disconnect();
      endPlaceholderVisible = false;
      m.redraw();
    });
  });
}
