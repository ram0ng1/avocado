import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import extractText from 'flarum/common/utils/extractText';

import { trans, iconColors } from '../utils';
import InlineComposerState from '../states/InlineComposerState';
import TagPicker from './shared/TagPicker';

/**
 * A lista do seletor de tags do compositor da home, aberta direto (sem o
 * gatilho): busca, tags mães e filhas, limites de primárias/secundárias e o
 * "ignorar requisitos". É a mesma regra de seleção do compositor, então os dois
 * nunca discordam sobre o que pode ser escolhido.
 */
class TagsModalPicker extends TagPicker {
  view() {
    const state = this.attrs.state;
    const limits = this.readLimits();
    const { primaryCount, secondaryCount } = this.countSelected(state);

    return this.renderDropdown(state, this.filteredItems(state, limits), limits, primaryCount, secondaryCount);
  }
}

/**
 * Editar as tags de uma discussão — substitui o TagDiscussionModal do
 * flarum/tags no menu da discussão (utils/tagsModal.ts). Mesmo desenho do
 * seletor de tags do compositor da home: as escolhidas como chips no topo, a
 * busca e a lista logo abaixo, e as ações no rodapé.
 */
export default class TagsModal extends Modal<any> {
  private picker!: InlineComposerState;
  private tagsLoading = true;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.picker = new InlineComposerState();
    this.picker.tags = (this.attrs.discussion?.tags?.() || []).filter(Boolean);

    // Fora da lista de tags o store só tem as da discussão; a lista inteira
    // (com as filhas) vem do mesmo carregamento que o modal do flarum/tags faz.
    const tagList = (app as any).tagList;
    const loaded = tagList?.load ? tagList.load(['children', 'parent']) : Promise.resolve();
    loaded.finally(() => {
      this.tagsLoading = false;
      m.redraw();
    });
  }

  className() {
    return 'AvocadoTagsModal';
  }

  title() {
    return trans('ramon-avocado.forum.tags_modal.title', 'Edit tags');
  }

  content() {
    const state = this.picker;
    const discussion = this.attrs.discussion;
    const canSave = state.tagBypassReqs || state.tagsMeetMinimums();

    return (
      <div className="Modal-body">
        <form onsubmit={(e: Event) => this.onsubmit(e)}>
          {discussion && <p className="AvocadoTagsModal-discussion">{discussion.title()}</p>}

          <div className="AvocadoTagsModal-selected">
            {state.tags.length === 0 ? (
              <span className="AvocadoTagsModal-empty">{trans('ramon-avocado.forum.home.choose_tags', 'Choose tags')}</span>
            ) : (
              state.tags.map((tag: any) => this.renderChip(tag))
            )}
          </div>

          {this.tagsLoading ? <LoadingIndicator /> : <TagsModalPicker state={state} />}

          <div className="AvocadoTagsModal-actions">
            <Button className="Button AvocadoTagsModal-cancel" type="button" disabled={this.loading} onclick={() => this.hide()}>
              {trans('ramon-avocado.forum.tags_modal.cancel', 'Cancel')}
            </Button>
            <Button className="Button Button--primary AvocadoTagsModal-save" type="submit" loading={this.loading} disabled={!canSave}>
              {trans('ramon-avocado.forum.tags_modal.save', 'Save')}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  /** Chip de tag escolhida — o mesmo do gatilho do seletor da home; clicar remove. */
  private renderChip(tag: any) {
    const tagColor = tag.color?.() || null;

    return (
      <button
        key={tag.id?.()}
        type="button"
        className="AvocadoHome-tagChip"
        style={tagColor ? { '--tag-color': iconColors(tagColor).color } : {}}
        title={extractText(app.translator.trans('ramon-avocado.forum.tag_picker.remove'))}
        onclick={() => this.picker.removeTag(tag)}
      >
        {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
        {tag.name?.()}
        <i className="fas fa-times AvocadoHome-tagChipRemoveIcon" aria-hidden="true" />
      </button>
    );
  }

  onsubmit(e: Event) {
    e.preventDefault();

    const discussion = this.attrs.discussion;
    const tags = this.picker.tags;
    const current = (discussion.tags?.() || []).filter(Boolean);
    const unchanged = current.length === tags.length && current.every((t: any) => tags.includes(t));

    if (unchanged) {
      this.hide();
      return;
    }

    this.loading = true;
    discussion
      .save({ relationships: { tags } })
      .then(() => {
        // Na página da discussão o post de evento ("mudou as tags") entra no stream.
        (app.current as any).get?.('stream')?.update?.();
        this.hide();
        m.redraw();
      })
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
  }
}
