import { extend } from 'flarum/common/extend';
import Modal from 'flarum/common/components/Modal';
import ModalManager from 'flarum/common/components/ModalManager';

/**
 * Classes no <body> que dizem qual modal está montado, para o CSS vestir o
 * `.Modal-backdrop`, irmão do .ModalManager. No lugar de um `body:has(...)` no
 * LESS, que faria o navegador reavaliar a regra a cada mutação na página: aqui
 * a pergunta é feita só quando a resposta muda.
 *
 * A checagem é pelo DOM, como o :has() faria: o modal conta enquanto o elemento
 * existe (empilhado ou saindo), e um onremove de extensão sem super não deixa a
 * classe presa, porque o onupdate do ModalManager ressincroniza.
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
