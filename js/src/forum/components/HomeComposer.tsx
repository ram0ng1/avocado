// @ts-nocheck
import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Avatar from 'flarum/common/components/Avatar';
import TextEditor from 'flarum/common/components/TextEditor';
import { trans, FALLBACK_COLORS, iconColors, displayName } from '../utils';

export default class HomeComposer extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.composerTitle    = '';
    this.composerBody     = '';
    this.composerTags     = [];
    this.composerSubmitting = false;
    this.composerPreview  = false;
    this.tagPickerOpen    = false;
    this.tagBypassReqs    = false;
    this.tagFilter        = '';
    this._previewInterval = null;
    this.composerProxy = {
      isVisible: () => true,
      fields: { content: () => this.composerBody },
    };
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this._tagPickerOutside = (e) => {
      if (!this.tagPickerOpen) return;
      if (!e.target.closest?.('.AvocadoHome-tagPicker')) {
        this.tagPickerOpen = false;
        this.tagFilter = '';
        m.redraw();
      }
    };
    document.addEventListener('click', this._tagPickerOutside);
    setTimeout(() => {
      const el = document.querySelector('.AvocadoHome-composerTitle');
      if (el) el.focus();
    }, 50);
  }

  onremove(vnode) {
    super.onremove(vnode);
    document.removeEventListener('click', this._tagPickerOutside);
    clearInterval(this._previewInterval);
    this._previewInterval = null;
  }

  isComposerValid() {
    const title = this.composerTitle.trim();
    const body  = this.composerBody.trim();
    if (!title || !body) return false;
    if (!this.tagBypassReqs) {
      const minP = parseInt(app.forum.attribute('minPrimaryTags')) || 0;
      const minS = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
      const chosenPrimary = this.composerTags.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
      const chosenSecond  = this.composerTags.filter((t) => t.position?.() === null).length;
      const selectableTags = app.store.all('tags').filter(Boolean);
      if (selectableTags.length && (chosenPrimary < minP || chosenSecond < minS)) return false;
    }
    return true;
  }

  submitInlineComposer() {
    if (this.composerSubmitting) return;
    const title = this.composerTitle.trim();
    const body  = this.composerBody.trim();
    if (!title || !body) return;
    if (!this.tagBypassReqs) {
      const minP = parseInt(app.forum.attribute('minPrimaryTags')) || 0;
      const minS = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
      const chosenPrimary = this.composerTags.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
      const chosenSecond  = this.composerTags.filter((t) => t.position?.() === null).length;
      const selectableTags = app.store.all('tags').filter(Boolean);
      if (selectableTags.length && (chosenPrimary < minP || chosenSecond < minS)) {
        this.tagPickerOpen = true;
        m.redraw();
        return;
      }
    }
    this.composerSubmitting = true;
    m.redraw();
    const data: any = { title, content: body };
    if (this.composerTags.length > 0) {
      data.relationships = { tags: this.composerTags };
    }
    app.store.createRecord('discussions').save(data)
      .then((discussion) => {
        this.attrs.onClose();
        m.route.set(app.route.discussion(discussion));
      })
      .catch(() => {
        this.composerSubmitting = false;
        m.redraw();
      });
  }

  _injectToolbarBtns(container) {
    const ul = container?.querySelector?.('ul.TextEditor-controls');
    if (!ul) return;
    const isPreview    = this.composerPreview;
    const isValid      = this.isComposerValid();
    const isSubmitting = this.composerSubmitting;
    const iconCls   = isPreview ? 'icon fas fa-pen' : 'icon far fa-eye';
    const label     = isPreview
      ? trans('ramon-avocado.forum.home.composer_edit', 'Edit')
      : trans('ramon-avocado.forum.home.composer_preview', 'Preview');
    const previewCls = `Button Button--icon Button--link AvocadoHome-composerPreviewBtn${isPreview ? ' is-active' : ''}`;
    const existingPreview = ul.querySelector('.item-avocadoPreview');
    if (existingPreview) {
      const b = existingPreview.querySelector('button');
      const i = existingPreview.querySelector('i');
      if (b) { b.className = previewCls; b.setAttribute('aria-label', label); }
      if (i) { i.className = iconCls; }
    } else {
      const li  = document.createElement('li');
      li.className = 'item-avocadoPreview';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = previewCls;
      btn.setAttribute('aria-label', label);
      const icon = document.createElement('i');
      icon.setAttribute('aria-hidden', 'true');
      icon.className = iconCls;
      btn.appendChild(icon);
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.composerPreview = !this.composerPreview;
        m.redraw();
      });
      li.appendChild(btn);
      ul.insertBefore(li, ul.firstChild);
    }
    const submitCls = `Button Button--primary AvocadoHome-composer-submit${isSubmitting ? ' is-loading' : ''}${!isValid ? ' is-disabled' : ''}`;
    const submitTxt = isSubmitting
      ? trans('ramon-avocado.forum.home.composer_submitting', 'Posting…')
      : trans('ramon-avocado.forum.home.composer_post', 'Post Discussion');
    const existingPost = ul.querySelector('.item-avocadoPost');
    if (existingPost) {
      const btnPost = existingPost.querySelector('button');
      if (btnPost) {
        btnPost.className = submitCls;
        (btnPost as HTMLButtonElement).disabled = isSubmitting || !isValid;
        btnPost.textContent = submitTxt;
      }
    } else {
      const spacer = document.createElement('li');
      spacer.className = 'item-avocadoSpacer';
      ul.appendChild(spacer);
      const liClose = document.createElement('li');
      liClose.className = 'item-avocadoClose';
      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.className = 'Button AvocadoHome-composer-cancel';
      btnClose.textContent = trans('ramon-avocado.forum.home.composer_close', 'Close');
      btnClose.addEventListener('click', () => { this.attrs.onClose(); });
      liClose.appendChild(btnClose);
      ul.appendChild(liClose);
      const liPost = document.createElement('li');
      liPost.className = 'item-avocadoPost';
      const btnPost = document.createElement('button');
      btnPost.type = 'button';
      btnPost.className = submitCls;
      (btnPost as HTMLButtonElement).disabled = isSubmitting || !isValid;
      btnPost.textContent = submitTxt;
      btnPost.addEventListener('click', () => this.submitInlineComposer());
      liPost.appendChild(btnPost);
      ul.appendChild(liPost);
    }
  }

  renderTagPicker() {
    const rawMaxP = parseInt(app.forum.attribute('maxPrimaryTags'));
    const rawMaxS = parseInt(app.forum.attribute('maxSecondaryTags'));
    const maxPrimary = isNaN(rawMaxP) ? Infinity : rawMaxP;
    const maxSecond  = isNaN(rawMaxS) ? Infinity : rawMaxS;
    const minPrimary = parseInt(app.forum.attribute('minPrimaryTags'))  || 0;
    const minSecond  = parseInt(app.forum.attribute('minSecondaryTags')) || 0;
    const canBypass  = !!app.forum.attribute('canBypassTagCounts');
    const selected     = this.composerTags;
    const bypass       = this.tagBypassReqs;
    const primaryCount = selected.filter((t) => t.position?.() !== null && !t.isChild?.()).length;
    const secondCount  = selected.filter((t) => t.position?.() === null).length;
    const allTags  = app.store.all('tags').filter(Boolean);
    const rootTags = allTags
      .filter((t) => !t.isChild?.())
      .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));
    const tagItems = [];
    for (const root of rootTags) {
      tagItems.push({ tag: root, isChild: false });
      allTags
        .filter((t) => t.isChild?.() && t.parent?.()?.id?.() === root.id?.())
        .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999))
        .forEach((child) => tagItems.push({ tag: child, isChild: true }));
    }
    const visibleItems = (maxSecond === 0 && !bypass)
      ? tagItems.filter(({ isChild }) => !isChild)
      : tagItems;
    const filterText = (this.tagFilter || '').toLowerCase();
    const filtered = filterText
      ? visibleItems.filter(({ tag }) => tag.name?.().toLowerCase().includes(filterText))
      : visibleItems;
    const canSelectTag = (tag) => {
      if (bypass || selected.includes(tag)) return true;
      const isPrimary = tag.position?.() !== null && !tag.isChild?.();
      if (!isPrimary && primaryCount === 0) return false;
      if (isPrimary && primaryCount >= maxPrimary) return false;
      if (!isPrimary && secondCount >= maxSecond) return false;
      return true;
    };
    let instruction = '';
    if (!bypass) {
      if (primaryCount < minPrimary) {
        const n = minPrimary - primaryCount;
        instruction = n === 1 ? 'Choose 1 primary tag' : `Choose ${n} primary tags`;
      } else if (secondCount < minSecond) {
        const n = minSecond - secondCount;
        instruction = n === 1 ? 'Choose 1 secondary tag' : `Choose ${n} secondary tags`;
      }
    }
    const addTag = (tag) => {
      if (selected.includes(tag)) return;
      const next = [...selected];
      const parent = tag.parent?.();
      if (parent && parent !== false && !next.includes(parent)) next.push(parent);
      next.push(tag);
      this.composerTags = next;
      this.tagFilter = '';
      m.redraw();
    };
    const removeTag = (tag) => {
      this.composerTags = this.composerTags.filter(
        (t) => t !== tag && t.parent?.()?.id?.() !== tag.id?.()
      );
      m.redraw();
    };
    return (
      <div className="AvocadoHome-tagPicker">
        <button
          className={`AvocadoHome-tagPickerTrigger${this.tagPickerOpen ? ' is-open' : ''}`}
          type="button"
          onclick={(e) => {
            e.preventDefault(); e.stopPropagation();
            this.tagPickerOpen = !this.tagPickerOpen;
            if (!this.tagPickerOpen) this.tagFilter = '';
            m.redraw();
          }}
        >
          <i className="fas fa-tag" aria-hidden="true" />
          {selected.length === 0 && (
            <span className="AvocadoHome-tagPickerPlaceholder">
              {instruction || trans('ramon-avocado.forum.home.choose_tags', 'Choose tags')}
            </span>
          )}
          {selected.map((tag) => {
            const tagColor = tag.color?.() || null;
            return (
              <span
                key={tag.id?.()}
                className="AvocadoHome-tagChip"
                style={tagColor ? { '--tag-color': iconColors(tagColor).color } : {}}
                onclick={(e) => { e.preventDefault(); e.stopPropagation(); removeTag(tag); }}
                title="Remove tag"
              >
                {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                {tag.name?.()}
                <i className="fas fa-times AvocadoHome-tagChipRemoveIcon" aria-hidden="true" />
              </span>
            );
          })}
          <i className={`fas fa-chevron-${this.tagPickerOpen ? 'up' : 'down'} AvocadoHome-tagPickerChevron`} aria-hidden="true" />
        </button>
        {this.tagPickerOpen && (
          <div className="AvocadoHome-tagPickerDropdown">
            <div className="AvocadoHome-tagPickerSearch">
              <i className="fas fa-search" aria-hidden="true" />
              <input
                type="text"
                placeholder={trans('ramon-avocado.forum.home.filter_tags', 'Filter tags')}
                value={this.tagFilter || ''}
                oninput={(e) => { this.tagFilter = e.target.value; m.redraw(); }}
                onclick={(e) => e.stopPropagation()}
                oncreate={(vnode) => { setTimeout(() => vnode.dom.focus(), 0); }}
              />
            </div>
            {filtered.length === 0
              ? <span className="AvocadoHome-tagPickerEmpty">{trans('ramon-avocado.forum.home.no_tags_found', 'No tags found')}</span>
              : <ul className="AvocadoHome-tagPickerList">
                  {filtered.map(({ tag, isChild }) => {
                    const tagId      = tag.id?.();
                    const isSelected = selected.includes(tag);
                    const tagColor   = tag.color?.() || FALLBACK_COLORS[0];
                    const selectable = canSelectTag(tag);
                    return (
                      <li
                        key={tagId}
                        className={[
                          'AvocadoHome-tagPickerItem',
                          isChild    && 'is-child',
                          isSelected && 'is-selected',
                          !selectable && !isSelected && 'is-disabled',
                        ].filter(Boolean).join(' ')}
                        onclick={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          if (!selectable && !isSelected) return;
                          isSelected ? removeTag(tag) : addTag(tag);
                        }}
                      >
                        <span className="AvocadoHome-tagPickerItem-icon" style={{ background: tagColor }}>
                          {tag.icon?.()
                            ? <i className={tag.icon()} aria-hidden="true" />
                            : <i className="fas fa-tag" aria-hidden="true" />
                          }
                        </span>
                        <span className="AvocadoHome-tagPickerItem-name">{tag.name?.()}</span>
                        {tag.description?.() && (
                          <span className="AvocadoHome-tagPickerItem-desc">{tag.description()}</span>
                        )}
                        {isSelected && <i className="fas fa-check AvocadoHome-tagPickerItem-check" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
            }
            {canBypass && (
              <label className="AvocadoHome-tagPickerBypass" onclick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={this.tagBypassReqs}
                  onchange={(e) => { this.tagBypassReqs = e.target.checked; m.redraw(); }}
                />
                {' Bypass tag requirements'}
              </label>
            )}
          </div>
        )}
      </div>
    );
  }

  view() {
    const { user, onClose } = this.attrs;
    return (
      <div className="AvocadoHome-composer">
        <div className="AvocadoHome-composer-header">
          <div className="AvocadoHome-composer-avatar">
            <Avatar user={user} title={displayName(user)} />
          </div>
          <input
            className="AvocadoHome-composerTitle"
            type="text"
            placeholder={trans('ramon-avocado.forum.home.composer_title_placeholder', 'Discussion title…')}
            value={this.composerTitle}
            oninput={(e) => { this.composerTitle = e.target.value; }}
          />
        </div>
        <div className="AvocadoHome-composer-tags">
          {this.renderTagPicker()}
        </div>
        <div
          className={`AvocadoHome-composerBody${this.composerPreview ? ' is-preview' : ''}`}
          oncreate={(vnode) => { setTimeout(() => this._injectToolbarBtns(vnode.dom), 0); }}
          onupdate={(vnode) => { this._injectToolbarBtns(vnode.dom); }}
        >
          <TextEditor
            composer={this.composerProxy}
            value={this.composerBody}
            placeholder={trans('ramon-avocado.forum.home.composer_body_placeholder', 'Tell everyone what are you working on...')}
            onchange={(value) => { this.composerBody = value; m.redraw(); }}
            onsubmit={() => this.submitInlineComposer()}
          />
          <div className="AvocadoHome-composerPreviewArea">
            <article className="CommentPost Post">
              <div className="Post-container">
                <div
                  className="Post-body"
                  oncreate={(vnode) => {
                    let lastContent: string | undefined;
                    let wasPreview = false;
                    const update = () => {
                      const isPreview = this.composerPreview;
                      if (!isPreview) { lastContent = undefined; wasPreview = false; return; }
                      const content = this.composerBody || '';
                      const justOpened = !wasPreview;
                      wasPreview = true;
                      if (!justOpened && lastContent === content) return;
                      lastContent = content;
                      setTimeout(() => {
                        if (!this.composerPreview) return;
                        if (!content.trim()) {
                          vnode.dom.innerHTML = '';
                          const span = document.createElement('span');
                          span.className = 'AvocadoHome-composerPreviewEmpty';
                          span.textContent = trans('ramon-avocado.forum.home.composer_preview_empty', 'Nothing to preview.');
                          vnode.dom.appendChild(span);
                        } else {
                          const s9e = (window as any).s9e;
                          if (s9e?.TextFormatter?.preview) {
                            s9e.TextFormatter.preview(content, vnode.dom);
                            app.visuals?.processPost?.(vnode.dom);
                            setTimeout(() => {
                              if (!this.composerPreview) return;
                              vnode.dom.querySelectorAll('.Sticker--tgs, .Sticker--lottie').forEach((el: Element) => {
                                if (el.querySelector('canvas')) return;
                                const clone = el.cloneNode(true) as Element;
                                clone.removeAttribute('data-tgs-init');
                                clone.removeAttribute('data-lottie-init');
                                el.parentNode?.replaceChild(clone, el);
                              });
                            }, 200);
                          } else {
                            vnode.dom.textContent = content;
                          }
                        }
                      }, 0);
                    };
                    update();
                    this._previewInterval = setInterval(update, 50);
                  }}
                  onremove={() => { clearInterval(this._previewInterval); this._previewInterval = null; }}
                />
              </div>
            </article>
          </div>
        </div>
      </div>
    );
  }
}
