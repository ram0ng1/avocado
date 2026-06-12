import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import { trans, displayName, tagsRequireHeroImage } from '../../utils';
import InlineComposerState from '../../states/InlineComposerState';
import TagPicker from './TagPicker';
import ComposerTextEditor from './ComposerTextEditor';

export interface IInlineComposerAttrs extends ComponentAttrs {
  /** The user authoring the discussion (drives the avatar + permission checks). */
  user: any;
  /** Optional pre-existing state instance. A fresh one is created when omitted. */
  state?: InlineComposerState;
  /** Called when the user closes the composer (cancel button). */
  onClose: () => void;
  /** Called after a successful submission with the saved Discussion. */
  onSubmitted?: (discussion: any) => void;
}

/**
 * InlineComposer — the always-visible "tell everyone what you're working on"
 * composer used by HomePage and AllDiscussionsPage.
 *
 * Owns:
 *  - An `InlineComposerState` (fields, tags, preview/submit flags).
 *  - A `TagPicker` component for tag selection.
 *  - A `ComposerTextEditor` (TextEditor subclass) with preview/close/submit
 *    buttons added via `controlItems()` — no DOM mutation.
 *  - A live s9e preview that re-renders on every redraw (no setInterval).
 *
 * Re-uses the existing `.AvocadoHome-composer*` CSS so visuals don't shift.
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

    // Close the tag picker when the user clicks outside it.
    this.outsideClickHandler = (e: Event) => {
      if (!this.state.tagPickerOpen) return;
      if (!(e.target as HTMLElement).closest?.('.AvocadoHome-tagPicker')) {
        this.state.tagPickerOpen = false;
        this.state.tagFilter = '';
        m.redraw();
      }
    };
    document.addEventListener('click', this.outsideClickHandler);

    // Auto-focus the title input on mount.
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

    return (
      <div className="AvocadoHome-composer">
        <div className="AvocadoHome-composer-header">
          <div className="AvocadoHome-composer-avatar">{user && <Avatar user={user} title={displayName(user)} />}</div>
          <input
            className="AvocadoHome-composerTitle"
            type="text"
            placeholder={trans('ramon-avocado.forum.home.composer_title_placeholder', 'Discussion title…')}
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

        <div className={`AvocadoHome-composerBody${state.preview ? ' is-preview' : ''}`}>
          <ComposerTextEditor
            composer={state.composerProxy}
            value={state.body}
            placeholder={trans('ramon-avocado.forum.home.composer_body_placeholder', 'Tell everyone what are you working on...')}
            onchange={(value: string) => {
              state.body = value;
              m.redraw();
            }}
            onsubmit={() => this.submit()}
            previewControl={this.renderPreviewButton()}
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

  // ── Hero image field (minimal chip) ────────────────────────────────────
  // Sits as a single inline button that toggles between "Imagem do hero" and
  // a chip showing the picked file's thumbnail + filename + remove (×).
  // Stays one row tall (32px) so it never breaks the composer's layout.

  private renderHeroImageField() {
    const state = this.state;
    const previewUrl = state.heroImagePreview;

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
      </div>
    );
  }

  // ── Toolbar buttons ────────────────────────────────────────────────────

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
      : trans('ramon-avocado.forum.home.composer_post', 'Post Discussion');
    const cls = `Button Button--primary AvocadoHome-composer-submit${isSubmitting ? ' is-loading' : ''}${!isValid ? ' is-disabled' : ''}`;

    return (
      <button type="button" className={cls} disabled={isSubmitting || !isValid} onclick={() => this.submit()}>
        {label}
      </button>
    );
  }

  // ── Submission ─────────────────────────────────────────────────────────

  private submit(): void {
    this.state
      .submit()
      .then((discussion: any) => {
        this.attrs.onSubmitted?.(discussion);
        this.attrs.onClose();
      })
      .catch(() => {
        // Errors already left state in a consistent shape; nothing else to do.
      });
  }

  // ── Live preview ───────────────────────────────────────────────────────

  /**
   * Rerender the s9e preview when content or visibility changes.
   *
   * Mithril fires `onupdate` after every redraw, so polling is unnecessary —
   * we cache the last-rendered body and only re-invoke s9e when the body
   * actually changed (or when preview just toggled on).
   */
  private renderPreview(dom: HTMLElement): void {
    const isPreview = this.state.preview;

    // Reset cache when leaving preview mode so re-entering fully redraws.
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

    if (!content.trim()) {
      dom.replaceChildren();
      const empty = document.createElement('span');
      empty.className = 'AvocadoHome-composerPreviewEmpty';
      empty.textContent = trans('ramon-avocado.forum.home.composer_preview_empty', 'Nothing to preview.');
      dom.appendChild(empty);
      return;
    }

    const s9e = (window as any).s9e;
    if (s9e?.TextFormatter?.preview) {
      s9e.TextFormatter.preview(content, dom);
      (app as any).visuals?.processPost?.(dom);
      // Sticker / lottie spans rely on a deferred async fetch; clone-and-replace
      // forces the IntersectionObserver to re-attach when the canvas wasn't created.
      setTimeout(() => {
        if (!this.state.preview) return;
        dom.querySelectorAll('.Sticker--tgs, .Sticker--lottie').forEach((el) => {
          if (el.querySelector('canvas')) return;
          const clone = el.cloneNode(true) as Element;
          clone.removeAttribute('data-tgs-init');
          clone.removeAttribute('data-lottie-init');
          el.parentNode?.replaceChild(clone, el);
        });
      }, 200);
    } else {
      dom.textContent = content;
    }
  }
}
