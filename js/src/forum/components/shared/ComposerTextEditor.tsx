import TextEditor from 'flarum/common/components/TextEditor';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import listItems from 'flarum/common/helpers/listItems';
import type ItemList from 'flarum/common/utils/ItemList';
import type Mithril from 'mithril';

type Children = Mithril.Children;

export interface IComposerTextEditorAttrs {
  /** Standard TextEditor attrs (forwarded). */
  composer: any;
  value: string;
  placeholder?: string;
  onchange?: (value: string) => void;
  onsubmit?: () => void;

  /** Preview-toggle button rendered on the **left** of the toolbar. */
  previewControl?: Children;
  /** Cancel/close button rendered on the right (before submit). */
  closeControl?: Children;
  /** Primary submit button rendered on the **far right** of the toolbar. */
  submitControl?: Children;
}

/**
 * TextEditor subclass that exposes slots for Avocado's inline composer.
 *
 * Replaces the previous `injectToolbarButtons` DOM-mutation hack: instead of
 * mutating the rendered `<ul.TextEditor-controls>` after Mithril mounts it,
 * we override `controlItems()` to register our buttons via the priority-sorted
 * `ItemList`, then override `view()` to interleave them with the static
 * `<li class="TextEditor-toolbar">` that core renders outside the list.
 *
 * Final layout (DOM order = visual order = tab order):
 *  ┌────────────────────────────────────────────────────────────────────────┐
 *  │ [preview] │ ⟨core toolbar: B/I/H/…⟩ │ ⟨core submit, hidden⟩ │ [spacer] [close] [post] │
 *  └────────────────────────────────────────────────────────────────────────┘
 *
 * Items with positive priority render BEFORE the markdown toolbar; items with
 * non-positive priority render AFTER. Core's own `submit` item (priority 0)
 * lands after the toolbar — it's hidden via CSS (`li.App-primaryControl`).
 *
 * ItemList keys are kept in camelCase (`avocadoPreview`, `avocadoSpacer`,
 * `avocadoClose`, `avocadoPost`) so the rendered `<li class="item-…">` matches
 * the existing selectors in `less/forum/HomePage.less`.
 */
export default class ComposerTextEditor extends TextEditor {
  controlItems(): ItemList<Children> {
    const items = super.controlItems();
    const { previewControl, closeControl, submitControl } = this.attrs as IComposerTextEditorAttrs;

    if (previewControl) {
      items.add('avocadoPreview', previewControl, 1000);
    }
    items.add('avocadoSpacer', <span aria-hidden="true" />, -100);
    if (closeControl) {
      items.add('avocadoClose', closeControl, -110);
    }
    if (submitControl) {
      items.add('avocadoPost', submitControl, -120);
    }

    return items;
  }

  view() {
    if (this.loading) {
      return (
        <div className="TextEditor">
          <LoadingIndicator />
        </div>
      );
    }

    const itemList = this.controlItems();
    const sortedItems = itemList.toArray();
    const priorities = itemList.toObject();

    const beforeToolbar: any[] = [];
    const afterToolbar: any[] = [];
    for (const item of sortedItems) {
      const name = (item as any).itemName as string;
      const priority = priorities[name]?.priority ?? 0;
      if (priority > 0) beforeToolbar.push(item);
      else afterToolbar.push(item);
    }

    return (
      <div className="TextEditor">
        <div className="TextEditor-editorContainer"></div>

        <ul className="TextEditor-controls Composer-footer">
          {listItems(beforeToolbar)}
          <li className="TextEditor-toolbar">{this.toolbarItems().toArray()}</li>
          {listItems(afterToolbar)}
        </ul>
      </div>
    );
  }
}
