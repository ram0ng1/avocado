import app from 'flarum/forum/app';
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
  oncreate(vnode: any) {
    super.oncreate(vnode);

    // fof/upload: a galeria "My media" insere o arquivo escolhido em
    // `app.composer.editor` (o compositor do core), não no editor de onde ela
    // foi aberta — daqui o arquivo não chegava a lugar nenhum. O upload direto
    // usa o editor da própria barra e funciona. No clique, o editor deste
    // compositor é emprestado ao do core enquanto houver modal aberto.
    this.element.addEventListener(
      'click',
      (e: Event) => {
        if ((e.target as HTMLElement).closest?.('.item-fof-upload-media')) this.lendEditor();
      },
      true
    );
  }

  /**
   * Põe este editor no lugar de `app.composer.editor` e devolve o original
   * quando não sobrar modal aberto por um tempo. O tempo cobre a troca da
   * galeria pelo modal de nome de exibição que o fof/upload abre antes de
   * inserir (carregado sob demanda, há um intervalo sem modal nenhum).
   */
  private lendEditor(): void {
    const own = (this.attrs as IComposerTextEditorAttrs).composer?.editor;
    const global = app.composer as any;
    if (!own || global.editor === own) return;

    const previous = global.editor;
    global.editor = own;

    const QUIET_MS = 1500;
    let closedSince = 0;
    const timer = window.setInterval(() => {
      const open = (app.modal as any).isModalOpen?.() ?? !!(app.modal as any).modalList?.length;
      if (open) {
        closedSince = 0;
        return;
      }
      closedSince ||= Date.now();
      if (Date.now() - closedSince < QUIET_MS) return;

      window.clearInterval(timer);
      if (global.editor === own) global.editor = previous;
    }, 200);
  }

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
