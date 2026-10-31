import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import listItems from 'flarum/common/helpers/listItems';
import type ItemList from 'flarum/common/utils/ItemList';
import type Mithril from 'mithril';

type Children = Mithril.Children;

export interface IComposerTextEditorAttrs {
  composer: any;
  value: string;
  placeholder?: string;
  onchange?: (value: string) => void;
  onsubmit?: () => void;

  /** Botão de prévia, à esquerda da barra. */
  previewControl?: Children;
  /** Salvar rascunho (fof/drafts), à direita, antes de fechar. */
  draftControl?: Children;
  /** Fechar, à direita, antes de enviar. */
  closeControl?: Children;
  /** Enviar, no extremo direito. */
  submitControl?: Children;
}

/**
 * TextEditor com espaços para os botões do compositor do tema: entram em
 * `controlItems()` e o `view()` os intercala com a barra de markdown, que o core
 * desenha fora da lista. Prioridade positiva fica antes da barra; o `submit` do
 * core (prioridade 0) fica depois e o CSS o esconde.
 *
 * As chaves em camelCase (`avocadoPreview`, …) casam com os seletores
 * `item-…` de `less/forum/HomePage.less`.
 */
export default class ComposerTextEditor extends TextEditor {
  oncreate(vnode: any) {
    super.oncreate(vnode);

    // fof/upload: a galeria "My media" insere em `app.composer.editor` (o do core),
    // não no editor que a abriu. No clique, este editor é emprestado ao core
    // enquanto houver modal aberto.
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
    const { previewControl, draftControl, closeControl, submitControl } = this.attrs as IComposerTextEditorAttrs;

    if (previewControl) {
      items.add('avocadoPreview', previewControl, 1000);
    }
    items.add('avocadoSpacer', <span aria-hidden="true" />, -100);
    if (draftControl) {
      items.add('avocadoDraft', draftControl, -105);
    }
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
