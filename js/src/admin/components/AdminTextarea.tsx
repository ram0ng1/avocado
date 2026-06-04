import app from 'flarum/admin/app';
import { AdminComponent, getStr, saveSetting } from '../util';

// Like AdminText but multi-line. Used for HTML/CSS settings (custom hero, etc.).
export default class AdminTextarea extends AdminComponent {
  _timer: any = null;
  oninit(vnode: any) {
    super.oninit(vnode);
    this._timer = null;
  }

  view() {
    const { settingKey, label, help, placeholder, rows = 8, className = '' } = this.attrs;
    const value = getStr(settingKey);
    return (
      <div className="Form-group">
        {label && <label className="AvocadoAdmin-label">{label}</label>}
        <textarea
          className={`FormControl ${className}`.trim()}
          rows={rows}
          value={value}
          placeholder={placeholder || ''}
          oninput={(e: any) => {
            const val = e.target.value;
            app.data.settings[settingKey] = val;
            clearTimeout(this._timer);
            this._timer = setTimeout(() => saveSetting({ [settingKey]: val }), 600);
          }}
        />
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}
