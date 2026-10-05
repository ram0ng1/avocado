import { extend } from 'flarum/common/extend';
import Modal from 'flarum/common/components/Modal';
import ModalManager from 'flarum/common/components/ModalManager';

/**
 * Classes no <body> que dizem qual modal está montado, para o CSS vestir o
 * `.Modal-backdrop` (irmão do .ModalManager, então não dá para alcançá-lo com
 * um seletor descendente do modal).
 *
 * Antes isso era `body:has(.ModalManager .SearchModal…) .Modal-backdrop` no
 * LESS. Um :has() com o <body> como sujeito obriga o navegador a reavaliar a
 * regra a cada mutação em qualquer lugar da página (digitar na busca, posts
 * entrando na discussão), não só ao abrir/fechar um modal. Aqui a pergunta é
 * feita uma vez, nos únicos momentos em que a resposta muda.
 *
 * A checagem é pelo DOM (e não por contagem de oncreate/onremove) para casar
 * exatamente com o que o :has() via: o modal conta enquanto o elemento existe
 * — inclusive empilhado atrás de outro e durante a animação de saída — e um
 * modal de extensão que sobrescreva onremove sem chamar o super não deixa a
 * classe presa (o onupdate do ModalManager ressincroniza).
 */
const BACKDROP_CLASSES: Record<string, string> = {
  // Spotlight da busca V2 (less/forum/SearchModal.less).
  'avocado-backdrop--search': '.ModalManager .SearchModal.Modal--flat',
  // Modais com o fundo escurecido + blur (TagsModal.less e DiscussionModals.less).
  'avocado-backdrop--dim':
    '.ModalManager .AvocadoTagsModal, .ModalManager .RenameDiscussionModal, .ModalManager .TagDiscussionModal, .ModalManager .AvocadoBookmarkModal',
};

function syncBackdropClasses(): void {
  const body = document.body;
  if (!body) return;

  for (const cls in BACKDROP_CLASSES) {
    body.classList.toggle(cls, !!document.querySelector(BACKDROP_CLASSES[cls]));
  }
}

export default function installModalBackdropClasses(): void {
  // oncreate roda com o elemento já no DOM. O onremove do Mithril roda ANTES de
  // tirar o nó, por isso a checagem vai para uma microtask: ainda antes do
  // próximo paint, mas já com o modal fora do DOM.
  extend(Modal.prototype, 'oncreate', syncBackdropClasses);
  extend(Modal.prototype, 'onremove', () => queueMicrotask(syncBackdropClasses));
  extend(ModalManager.prototype, 'onupdate', syncBackdropClasses);
}
