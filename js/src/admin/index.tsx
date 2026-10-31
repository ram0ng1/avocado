import app from 'flarum/admin/app';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import { override } from 'flarum/common/extend';
import extendEditTagModal from './extendEditTagModal';
import { installTagIconSvg } from '../common/tagIconSvg';

export { default as extend } from './extend';

app.initializers.add('ramon-avocado', () => {
  // Todos os controles salvam sozinhos: o botão "Salvar" nativo só confundiria.
  override(ExtensionPage.prototype, 'submitButton', function (original) {
    if (this.extension?.id === 'ramon-avocado') return null;
    return original();
  });

  // O flarum/tags é opcional para o tema: sem ele não há modal nem Tag para estender.
  if ('flarum-tags' in flarum.extensions) {
    installTagIconSvg();
    extendEditTagModal();
  }
});
