import app from 'flarum/admin/app';
import { AdminComponent, getStr, saveSetting } from '../util';

export default class AdminText extends AdminComponent {
  _timer: any = null;
  oninit(vnode: any) {
    super.oninit(vnode);
    this._timer = null;
  }

  view() {
    const { settingKey, label, help, placeholder } = this.attrs;
    const value = getStr(settingKey);
    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label">{label}</label>
        <input
          className="FormControl"
          type="text"
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
