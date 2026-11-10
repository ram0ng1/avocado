import app from 'flarum/admin/app';
import { AdminComponent, fieldId, getStr, markSaving, saveSetting } from '../util';
import SaveStatus from './SaveStatus';

export default class AdminText extends AdminComponent {
  _timer: any = null;
  oninit(vnode: any) {
    super.oninit(vnode);
    this._timer = null;
  }

  /** Grava o que foi digitado: ao parar de digitar ou ao sair do campo, o que vier antes. */
  flush(settingKey: string) {
    clearTimeout(this._timer);
    this._timer = null;
    saveSetting({ [settingKey]: app.data.settings[settingKey] }).catch(() => {});
  }

  view() {
    const { settingKey, label, help, placeholder, fallback } = this.attrs;
    // `fallback`: o valor mostrado enquanto a opção nunca foi gravada (o padrão
    // do tema). Gravada — mesmo vazia — vale o que está gravado.
    const stored = app.data.settings[settingKey];
    const value = fallback !== undefined && (stored === undefined || stored === null) ? fallback : getStr(settingKey);
    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label" for={fieldId(settingKey)}>
          {label}
          <SaveStatus settingKey={settingKey} />
        </label>
        <input
          id={fieldId(settingKey)}
          className="FormControl"
          type="text"
          value={value}
          placeholder={placeholder || ''}
          oninput={(e: any) => {
            const val = e.target.value;
            app.data.settings[settingKey] = val;
            markSaving(settingKey);
            clearTimeout(this._timer);
            this._timer = setTimeout(() => this.flush(settingKey), 600);
          }}
          onblur={() => this._timer && this.flush(settingKey)}
        />
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}
