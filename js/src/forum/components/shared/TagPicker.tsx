import app from 'flarum/forum/app';
import extractText from 'flarum/common/utils/extractText';
import Component from 'flarum/common/Component';
import type { ComponentAttrs } from 'flarum/common/Component';
import { trans, iconColors } from '../../utils';
import type InlineComposerState from '../../states/InlineComposerState';

export interface ITagPickerAttrs extends ComponentAttrs {
  state: InlineComposerState;
}

/**
 * Tag picker for the inline composer.
 *
 * Renders the trigger (chips for selected tags + placeholder) and the
 * dropdown (filterable list, hierarchical primary/child tags, optional
 * "bypass minimums" checkbox for privileged users).
 *
 * All state lives on `InlineComposerState`; this component is a thin view.
 */
export default class TagPicker<CustomAttrs extends ITagPickerAttrs = ITagPickerAttrs> extends Component<CustomAttrs> {
  view() {
    const state = this.attrs.state;
    const limits = this.readLimits();
    const { primaryCount, secondaryCount } = this.countSelected(state);

    const allTags = (app.store.all('tags') as any[]).filter(Boolean);
    const rootTags = allTags.filter((t) => !t.isChild?.()).sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));

    // Build a flat list interleaving root tags with their children.
    const tagItems: { tag: any; isChild: boolean }[] = [];
    for (const root of rootTags) {
      tagItems.push({ tag: root, isChild: false });
      allTags
        .filter((t: any) => t.isChild?.() && t.parent?.()?.id?.() === root.id?.())
        .sort((a: any, b: any) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999))
        .forEach((child: any) => tagItems.push({ tag: child, isChild: true }));
    }

    const visible = limits.maxSecondary === 0 && !state.tagBypassReqs ? tagItems.filter(({ isChild }) => !isChild) : tagItems;

    const filter = (state.tagFilter || '').toLowerCase();
    const filtered = filter ? visible.filter(({ tag }) => tag.name?.().toLowerCase().includes(filter)) : visible;

    const instruction = this.computeInstruction(state, limits, primaryCount, secondaryCount);

    return (
      <div className="AvocadoHome-tagPicker">
        {this.renderTrigger(state, instruction)}
        {state.tagPickerOpen && this.renderDropdown(state, filtered, limits, primaryCount, secondaryCount)}
      </div>
    );
  }

  // ── Subviews ───────────────────────────────────────────────────────────

  private renderTrigger(state: InlineComposerState, instruction: string) {
    return (
      <button
        className={`AvocadoHome-tagPickerTrigger${state.tagPickerOpen ? ' is-open' : ''}`}
        type="button"
        onclick={(e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          state.tagPickerOpen = !state.tagPickerOpen;
          if (!state.tagPickerOpen) state.tagFilter = '';
          m.redraw();
        }}
      >
        <i className="fas fa-tag" aria-hidden="true" />
        {state.tags.length === 0 && (
          <span className="AvocadoHome-tagPickerPlaceholder">{instruction || trans('ramon-avocado.forum.home.choose_tags', 'Choose tags')}</span>
        )}
        {state.tags.map((tag: any) => {
          const tagColor = tag.color?.() || null;
          return (
            <span
              key={tag.id?.()}
              className="AvocadoHome-tagChip"
              style={tagColor ? { '--tag-color': iconColors(tagColor).color } : {}}
              onclick={(e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                state.removeTag(tag);
                m.redraw();
              }}
              title={extractText(app.translator.trans('ramon-avocado.forum.tag_picker.remove'))}
            >
              {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
              {tag.name?.()}
              <i className="fas fa-times AvocadoHome-tagChipRemoveIcon" aria-hidden="true" />
            </span>
          );
        })}
        <i className={`fas fa-chevron-${state.tagPickerOpen ? 'up' : 'down'} AvocadoHome-tagPickerChevron`} aria-hidden="true" />
      </button>
    );
  }

  private renderDropdown(
    state: InlineComposerState,
    items: { tag: any; isChild: boolean }[],
    limits: ReturnType<TagPicker['readLimits']>,
    primaryCount: number,
    secondaryCount: number
  ) {
    return (
      <div className="AvocadoHome-tagPickerDropdown">
        <div className="AvocadoHome-tagPickerSearch">
          <i className="fas fa-search" aria-hidden="true" />
          <input
            type="text"
            placeholder={trans('ramon-avocado.forum.home.filter_tags', 'Filter tags')}
            value={state.tagFilter || ''}
            oninput={(e: Event) => {
              state.tagFilter = (e.target as HTMLInputElement).value;
              m.redraw();
            }}
            onclick={(e: Event) => e.stopPropagation()}
            oncreate={(vnode: any) => setTimeout(() => vnode.dom.focus(), 0)}
          />
        </div>

        {items.length === 0 ? (
          <span className="AvocadoHome-tagPickerEmpty">{trans('ramon-avocado.forum.home.no_tags_found', 'No tags found')}</span>
        ) : (
          <ul className="AvocadoHome-tagPickerList">
            {items.map(({ tag, isChild }) => this.renderItem(state, tag, isChild, limits, primaryCount, secondaryCount))}
          </ul>
        )}

        {limits.canBypass && (
          <label className="AvocadoHome-tagPickerBypass" onclick={(e: Event) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={state.tagBypassReqs}
              onchange={(e: Event) => {
                state.tagBypassReqs = (e.target as HTMLInputElement).checked;
                m.redraw();
              }}
            />
            {' ' + trans('ramon-avocado.forum.home.bypass_tag_requirements', 'Bypass tag requirements')}
          </label>
        )}
      </div>
    );
  }

  private renderItem(
    state: InlineComposerState,
    tag: any,
    isChild: boolean,
    limits: ReturnType<TagPicker['readLimits']>,
    primaryCount: number,
    secondaryCount: number
  ) {
    const tagId = tag.id?.();
    const isSelected = state.tags.includes(tag);
    // Tags sem cor customizada caem no `--primary-color` da skin via CSS;
    // setar `background: ''` inline anula a regra LESS e deixa o ícone
    // (color:#fff) invisível sobre fundo transparente no tema claro.
    const tagColor = tag.color?.() || null;
    const selectable = this.canSelectTag(tag, state, limits, primaryCount, secondaryCount);

    const className = ['AvocadoHome-tagPickerItem', isChild && 'is-child', isSelected && 'is-selected', !selectable && !isSelected && 'is-disabled']
      .filter(Boolean)
      .join(' ');

    return (
      <li
        key={tagId}
        className={className}
        onclick={(e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          if (!selectable && !isSelected) return;
          if (isSelected) state.removeTag(tag);
          else state.addTag(tag);
          m.redraw();
        }}
      >
        <span className="AvocadoHome-tagPickerItem-icon" style={tagColor ? { background: tagColor } : {}}>
          <i className={tag.icon?.() || 'fas fa-tag'} aria-hidden="true" />
        </span>
        <span className="AvocadoHome-tagPickerItem-name">{tag.name?.()}</span>
        {tag.description?.() && <span className="AvocadoHome-tagPickerItem-desc">{tag.description()}</span>}
        {isSelected && <i className="fas fa-check AvocadoHome-tagPickerItem-check" aria-hidden="true" />}
      </li>
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private readLimits() {
    const rawMaxP = parseInt(app.forum.attribute('maxPrimaryTags') as string);
    const rawMaxS = parseInt(app.forum.attribute('maxSecondaryTags') as string);
    return {
      maxPrimary: isNaN(rawMaxP) ? Infinity : rawMaxP,
      maxSecondary: isNaN(rawMaxS) ? Infinity : rawMaxS,
      minPrimary: parseInt(app.forum.attribute('minPrimaryTags') as string) || 0,
      minSecondary: parseInt(app.forum.attribute('minSecondaryTags') as string) || 0,
      canBypass: !!app.forum.attribute('canBypassTagCounts'),
    };
  }

  private countSelected(state: InlineComposerState) {
    return {
      primaryCount: state.tags.filter((t) => t.position?.() !== null && !t.isChild?.()).length,
      secondaryCount: state.tags.filter((t) => t.position?.() === null).length,
    };
  }

  private canSelectTag(
    tag: any,
    state: InlineComposerState,
    limits: ReturnType<TagPicker['readLimits']>,
    primaryCount: number,
    secondaryCount: number
  ): boolean {
    if (state.tagBypassReqs || state.tags.includes(tag)) return true;
    const isPrimary = tag.position?.() !== null && !tag.isChild?.();
    if (!isPrimary && primaryCount === 0) return false;
    if (isPrimary && primaryCount >= limits.maxPrimary) return false;
    if (!isPrimary && secondaryCount >= limits.maxSecondary) return false;
    return true;
  }

  private computeInstruction(
    state: InlineComposerState,
    limits: ReturnType<TagPicker['readLimits']>,
    primaryCount: number,
    secondaryCount: number
  ): string {
    if (state.tagBypassReqs) return '';
    if (primaryCount < limits.minPrimary) {
      const n = limits.minPrimary - primaryCount;
      return n === 1
        ? trans('ramon-avocado.forum.home.choose_primary_tag_singular', 'Choose 1 primary tag')
        : trans('ramon-avocado.forum.home.choose_primary_tag_plural', `Choose ${n} primary tags`, { count: n });
    }
    if (secondaryCount < limits.minSecondary) {
      const n = limits.minSecondary - secondaryCount;
      return n === 1
        ? trans('ramon-avocado.forum.home.choose_secondary_tag_singular', 'Choose 1 secondary tag')
        : trans('ramon-avocado.forum.home.choose_secondary_tag_plural', `Choose ${n} secondary tags`, { count: n });
    }
    return '';
  }
}
