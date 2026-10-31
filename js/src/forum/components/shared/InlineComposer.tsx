import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import { trans, displayName, tagsRequireHeroImage, tagsAreChangelogProducts } from '../../utils';
import InlineComposerState from '../../states/InlineComposerState';
import TagPicker from './TagPicker';
import ComposerTextEditor from './ComposerTextEditor';
import { changelogChips } from './ChangelogFields';
import { renderPostPreview } from '../../utils/composerPreview';

export interface IInlineComposerAttrs extends ComponentAttrs {
  /** Autor da discussão (avatar e permissões). */
  user: any;
  /** Estado já existente; sem ele, cria um novo. */
  state?: InlineComposerState;
  onClose: () => void;
  onSubmitted?: (discussion: any) => void;
  /**
   * O botão de salvar rascunho fica com quem embrulha o compositor
   * (FloatingInlineComposer o põe nos controles do canto, como no compositor do
   * core) — a barra do editor não o repete.
   */
  draftInControls?: boolean;
}

/**
 * O botão de salvar rascunho, igual ao que o fof/drafts põe no compositor do
 * core (ícone, título e estados). `className` são as classes de botão do lugar
 * onde ele entra: a barra do editor ou os controles do canto.
 */
export function renderDraftButton(state: InlineComposerState, className = 'Button Button--icon Button--link') {
  if (!state.canSaveDraft()) return null;

  const label = trans('fof-drafts.forum.composer.title', 'Save Draft');
  const icon = state.draftJustSaved ? 'fas fa-check' : state.savingDraft ? 'fas fa-spinner fa-spin' : 'fas fa-floppy-disk';
  const cls = `${className} AvocadoHome-composerDraftBtn${state.savingDraft ? ' saving' : ''}${state.draftJustSaved ? ' justSaved' : ''}`;

  return (
    <button
      type="button"
      className={cls}
      title={label}
      aria-label={label}
      disabled={state.savingDraft || state.draftJustSaved || !state.body.trim()}
      onclick={(e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        state.saveDraft();
      }}
    >
      <i aria-hidden="true" className={`icon Button-icon ${icon}`} />
    </button>
  );
}

/**
 * Compositor de nova discussão da home e de /discussions. Os botões entram pelo
 * `controlItems()` do ComposerTextEditor, sem mexer no DOM, e a prévia do s9e é
 * refeita no onupdate.
 */
export default class InlineComposer<CustomAttrs extends IInlineComposerAttrs = IInlineComposerAttrs> extends Component<
  CustomAttrs,
  InlineComposerState
> {
  state!: InlineComposerState;
  private outsideClickHandler: ((e: Event) => void) | null = null;
  private lastPreviewedContent: string | undefined;
  private wasPreviewActive = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.state = this.attrs.state ?? new InlineComposerState();
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);

    this.outsideClickHandler = (e: Event) => {
      if (!this.state.tagPickerOpen) return;
      if (!(e.target as HTMLElement).closest?.('.AvocadoHome-tagPicker')) {
        this.state.tagPickerOpen = false;
        this.state.tagFilter = '';
        m.redraw();
      }
    };
    document.addEventListener('click', this.outsideClickHandler);

    setTimeout(() => {
      const el = vnode.dom.querySelector('.AvocadoHome-composerTitle') as HTMLInputElement | null;
      el?.focus();
    }, 50);
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    if (this.outsideClickHandler) document.removeEventListener('click', this.outsideClickHandler);
    this.outsideClickHandler = null;
  }

  view() {
    const { user } = this.attrs;
    const state = this.state;
    // Com um produto do changelog escolhido o que se escreve é uma versão, não uma discussão.
    const isRelease = tagsAreChangelogProducts(state.tags);

    return (
      <div className="AvocadoHome-composer">
        <div className="AvocadoHome-composer-header">
          <div className="AvocadoHome-composer-avatar">{user && <Avatar user={user} title={displayName(user)} />}</div>
          <input
            className="AvocadoHome-composerTitle"
            type="text"
            placeholder={
              isRelease
                ? trans('ramon-avocado.forum.changelog.composer_title_placeholder', 'Release title…')
                : trans('ramon-avocado.forum.home.composer_title_placeholder', 'Discussion title…')
            }
            value={state.title}
            oninput={(e: Event) => {
              state.title = (e.target as HTMLInputElement).value;
            }}
          />
        </div>

        <div className="AvocadoHome-composer-tags">
          <TagPicker state={state} />
        </div>

        {tagsRequireHeroImage(state.tags) && this.renderHeroImageField()}

        <div className={`AvocadoHome-composerBody${state.preview ? (state.fullScreen ? ' is-split' : ' is-preview') : ''}`}>
          <ComposerTextEditor
            composer={state.composerProxy}
            value={state.body}
            placeholder={
              isRelease
                ? trans('ramon-avocado.forum.changelog.composer_body_placeholder', 'Write the release notes…')
                : trans('ramon-avocado.forum.home.composer_body_placeholder', 'Tell everyone what are you working on...')
            }
            onchange={(value: string) => {
              state.body = value;
              m.redraw();
            }}
            onsubmit={() => this.submit()}
            previewControl={this.renderPreviewButton()}
            draftControl={this.attrs.draftInControls ? null : renderDraftButton(this.state)}
            closeControl={this.renderCloseButton()}
            submitControl={this.renderSubmitButton()}
          />

          <div className="AvocadoHome-composerPreviewArea">
            <article className="CommentPost Post">
              <div className="Post-container">
                <div className="Post-body" oncreate={(v: any) => this.renderPreview(v.dom)} onupdate={(v: any) => this.renderPreview(v.dom)} />
              </div>
            </article>
          </div>
        </div>
      </div>
    );
  }

  // Imagem do hero num chip de uma linha só (32px), para não quebrar o layout do
  // compositor.

  private renderHeroImageField() {
    const state = this.state;
    const previewUrl = state.heroImagePreview;

    // Versão e capa colorida ficam na mesma linha do chip de imagem, e só
    // aparecem quando uma das tags escolhidas é um produto do changelog.
    const changelog = tagsAreChangelogProducts(state.tags)
      ? changelogChips({
          tags: state.tags,
          version: state.changelogVersion,
          onVersion: (value) => (state.changelogVersion = value),
          cover: state.changelogCover,
          onCover: (value) => (state.changelogCover = value),
          hasImage: !!previewUrl,
        })
      : [];

    const onPick = (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0] || null;
      if (file && file.type.startsWith('image/')) state.setHeroImageFile(file);
      input.value = '';
      m.redraw();
    };

    if (previewUrl) {
      return (
        <div className="AvocadoHome-composerHeroChipRow">
          <span className="AvocadoHome-composerHeroChip is-set" title={state.heroImageFile?.name || ''}>
            <span
              className="AvocadoHome-composerHeroChip-thumb"
              style={{ backgroundImage: `url(${JSON.stringify(previewUrl)})` }}
              aria-hidden="true"
            />
            <span className="AvocadoHome-composerHeroChip-label">
              {state.heroImageFile?.name || trans('ramon-avocado.forum.home.composer_hero_image_picked', 'Image selected')}
            </span>
            <button
              type="button"
              className="AvocadoHome-composerHeroChip-remove"
              aria-label={trans('ramon-avocado.forum.home.composer_hero_image_remove', 'Remove image')}
              onclick={() => {
                state.setHeroImageFile(null);
                m.redraw();
              }}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </span>
          {changelog}
        </div>
      );
    }

    return (
      <div className="AvocadoHome-composerHeroChipRow">
        <label className="AvocadoHome-composerHeroChip">
          <input type="file" accept="image/*" onchange={onPick} />
          <i className="fas fa-image" aria-hidden="true" />
          <span>{trans('ramon-avocado.forum.home.composer_hero_image_label', 'Hero image (optional)')}</span>
        </label>
        {changelog}
      </div>
    );
  }

  private renderPreviewButton() {
    const isPreview = this.state.preview;
    const label = isPreview ? trans('ramon-avocado.forum.home.composer_edit', 'Edit') : trans('ramon-avocado.forum.home.composer_preview', 'Preview');
    const iconCls = isPreview ? 'icon fas fa-pen' : 'icon far fa-eye';

    return (
      <button
        type="button"
        className={`Button Button--icon Button--link AvocadoHome-composerPreviewBtn${isPreview ? ' is-active' : ''}`}
        aria-label={label}
        onclick={(e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          this.state.preview = !this.state.preview;
          m.redraw();
        }}
      >
        <i aria-hidden="true" className={iconCls} />
      </button>
    );
  }

  private renderCloseButton() {
    return (
      <button type="button" className="Button AvocadoHome-composer-cancel" onclick={() => this.attrs.onClose()}>
        {trans('ramon-avocado.forum.home.composer_close', 'Close')}
      </button>
    );
  }

  private renderSubmitButton() {
    const isValid = this.state.isValid();
    const isSubmitting = this.state.submitting;
    const label = isSubmitting
      ? trans('ramon-avocado.forum.home.composer_submitting', 'Posting…')
      : tagsAreChangelogProducts(this.state.tags)
        ? trans('ramon-avocado.forum.changelog.composer_submit', 'Publish release')
        : trans('ramon-avocado.forum.home.composer_post', 'Post Discussion');
    const cls = `Button Button--primary AvocadoHome-composer-submit${isSubmitting ? ' is-loading' : ''}${!isValid ? ' is-disabled' : ''}`;

    return (
      <button type="button" className={cls} disabled={isSubmitting || !isValid} onclick={() => this.submit()}>
        {label}
      </button>
    );
  }

  private submit(): void {
    this.state
      .submit()
      .then((discussion: any) => {
        this.attrs.onSubmitted?.(discussion);
        this.attrs.onClose();
      })
      .catch(() => {
        // O erro já deixou o estado consistente.
      });
  }

  /**
   * O onupdate roda a cada redraw: a prévia do s9e só é refeita quando o corpo muda
   * ou a prévia acaba de abrir.
   */
  private renderPreview(dom: HTMLElement): void {
    const isPreview = this.state.preview;

    // Sair da prévia zera o cache, para a volta redesenhar tudo.
    if (!isPreview) {
      this.lastPreviewedContent = undefined;
      this.wasPreviewActive = false;
      return;
    }

    const content = this.state.body || '';
    const justOpened = !this.wasPreviewActive;
    this.wasPreviewActive = true;
    if (!justOpened && this.lastPreviewedContent === content) return;
    this.lastPreviewedContent = content;

    // A mesma renderização da prévia dentro do compositor do core.
    renderPostPreview(dom, content, () => this.state.preview);
  }
}
