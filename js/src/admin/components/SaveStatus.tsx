import Component from 'flarum/common/Component';
import { saveStateOf, trans } from '../util';

/**
 * "Salvando…", "Salvo" ou o erro de uma configuração, ao lado do rótulo dela.
 * Os controles gravam sozinhos: é o único sinal de que a mudança foi guardada.
 */
export default class SaveStatus extends Component<{ settingKey: string }> {
  view() {
    const status = saveStateOf(this.attrs.settingKey);
    if (!status) return null;

    if (status.state === 'error') {
      return (
        <span className="AvocadoAdmin-saveStatus AvocadoAdmin-saveStatus--error" role="alert">
          <i className="fas fa-exclamation-circle" aria-hidden="true" />
          {status.message}
        </span>
      );
    }

    return (
      <span className={`AvocadoAdmin-saveStatus AvocadoAdmin-saveStatus--${status.state}`} aria-live="polite">
        <i className={status.state === 'saving' ? 'fas fa-spinner fa-spin' : 'fas fa-check'} aria-hidden="true" />
        {status.state === 'saving' ? trans('ramon-avocado.admin.saving', 'Saving…') : trans('ramon-avocado.admin.saved', 'Saved')}
      </span>
    );
  }
}
