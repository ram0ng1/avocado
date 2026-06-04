import app from 'flarum/admin/app';
import { AdminComponent, getStr, saveSetting, trans } from '../util';

export default class AdminGroupPicker extends AdminComponent {
  groups: any[] = [];
  loaded = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    app.store
      .find('groups')
      .then((groups: any) => {
        this.groups = Array.isArray(groups) ? groups : [];
        this.loaded = true;
        m.redraw();
      })
      .catch(() => {
        this.loaded = true;
        m.redraw();
      });
  }

  getSelected() {
    try {
      return JSON.parse(getStr(this.attrs.settingKey, '[]') || '[]');
    } catch {
      return [];
    }
  }

  toggle(id: any) {
    const sel = this.getSelected();
    const idx = sel.indexOf(String(id));
    if (idx >= 0) sel.splice(idx, 1);
    else sel.push(String(id));
    const val = JSON.stringify(sel);
    app.data.settings[this.attrs.settingKey] = val;
    m.redraw();
    saveSetting({ [this.attrs.settingKey]: val });
  }

  view() {
    const { label, help } = this.attrs;
    const selected = this.getSelected().map(String);
    // Filter out Guests (id=2) and Members (id=3) — show only named/custom groups
    const groups = this.groups.filter((g) => g.id() !== '2' && g.id() !== '3');

    return (
      <div className="Form-group">
        {label && <label className="AvocadoAdmin-label">{label}</label>}
        {!this.loaded ? (
          <p className="helpText">{trans('ramon-avocado.admin.loading', 'Loading…')}</p>
        ) : !groups.length ? (
          <p className="helpText">{trans('ramon-avocado.admin.settings.team_groups_empty', 'No groups found.')}</p>
        ) : (
          <div className="AvocadoAdmin-tagPickerList">
            {groups.map((group) => {
              const id = String(group.id());
              const name = group.namePlural?.() || group.nameSingular?.() || `Group ${id}`;
              const color = group.color?.() || '#8f9097';
              const icon = group.icon?.() || 'fas fa-users';
              const isSelected = selected.includes(id);
              return (
                <li key={id} className={`AvocadoAdmin-tagPickerItem${isSelected ? ' is-selected' : ''}`} onclick={() => this.toggle(id)}>
                  <span className="AvocadoAdmin-tagPickerItem-icon" style={{ background: color }}>
                    <i className={icon} aria-hidden="true" />
                  </span>
                  <span className="AvocadoAdmin-tagPickerItem-name">{name}</span>
                  {isSelected && <i className="fas fa-check AvocadoAdmin-tagPickerItem-check" aria-hidden="true" />}
                </li>
              );
            })}
          </div>
        )}
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}
