import app from 'flarum/admin/app';
import Switch from 'flarum/common/components/Switch';
import { AdminComponent, getBool, saveSetting } from '../util';

// Self-contained boolean toggle: updates app.data.settings + persists immediately.
export default class AdminToggle extends AdminComponent {
  view() {
    const { settingKey, label, help } = this.attrs;
    const value = getBool(settingKey);
    return (
      <div className="Form-group AvocadoAdmin-toggle">
        <Switch
          state={value}
          onchange={(checked: any) => {
            app.data.settings[settingKey] = checked;
            m.redraw();
            saveSetting({ [settingKey]: checked ? '1' : '0' });
          }}
        >
          {label}
        </Switch>
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}
