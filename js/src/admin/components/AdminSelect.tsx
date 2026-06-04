import app from 'flarum/admin/app';
import { AdminComponent, getStr, saveSetting } from '../util';

export default class AdminSelect extends AdminComponent {
  view() {
    const { settingKey, label, help, options, default: def } = this.attrs;
    const keys = Object.keys(options);
    const value = getStr(settingKey, def ?? keys[0]);
    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label">{label}</label>
        <div className="AvocadoAdmin-select-wrap">
          <select
            className="FormControl AvocadoAdmin-select"
            value={value}
            onchange={(e: any) => {
              const val = e.target.value;
              app.data.settings[settingKey] = val;
              m.redraw();
              saveSetting({ [settingKey]: val });
            }}
          >
            {keys.map((k) => (
              <option key={k} value={k}>
                {options[k]}
              </option>
            ))}
          </select>
          <i className="fas fa-chevron-down AvocadoAdmin-select-chevron" aria-hidden="true" />
        </div>
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}
