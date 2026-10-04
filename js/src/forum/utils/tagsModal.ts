import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Button from 'flarum/common/components/Button';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import TagsModal from '../components/TagsModal';

/**
 * "Editar tags" do menu da discussão abre o modal do tema (TagsModal) em vez
 * do TagDiscussionModal do flarum/tags. O item continua sendo o do flarum/tags
 * (mesma chave, ícone, rótulo e permissão `canTag`); só o clique muda.
 *
 * Instalado num initializer de prioridade baixa (index.tsx), para rodar depois
 * do flarum/tags ter adicionado o item. Sem o flarum/tags não há o que trocar.
 */
export default function installTagsModal(): void {
  if (!('flarum-tags' in flarum.extensions)) return;

  extend(DiscussionControls, 'moderationControls', function (items: any, discussion: any) {
    if (!items.has?.('tags') || !discussion?.canTag?.()) return;

    items.setContent(
      'tags',
      Button.component(
        { icon: 'fas fa-tag', onclick: () => app.modal.show(TagsModal, { discussion }) },
        app.translator.trans('flarum-tags.forum.discussion_controls.edit_tags_button')
      )
    );
  });
}
