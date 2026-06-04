import app from 'flarum/admin/app';
import { AdminComponent, saveSetting, trans } from '../util';

// Multi-select tag picker that matches the AvocadoHome-tagPickerTrigger style
// from the forum composer. Saves as a JSON array.
export default class AdminTagPicker extends AdminComponent {
  _saveTimer: any = null;
  _onDocClick: ((e: Event) => void) | null = null;
  open = false;
  search = '';
  saving = false;
  tagsLoaded = false;
  tags: any[] = [];
  selected: Set<string> = new Set();
  oninit(vnode: any) {
    super.oninit(vnode);
    this.open = false;
    this.search = '';
    this.saving = false;
    this.tagsLoaded = false;
    this.tags = [];
    this.selected = new Set();
    this._saveTimer = null;

    // Load initial selection — supports both JSON array and legacy plain string
    try {
      const raw = app.data.settings[this.attrs.settingKey];
      if (raw) {
        const parsed = JSON.parse(raw);
        (Array.isArray(parsed) ? parsed : [parsed])
          .map(String)
          .filter(Boolean)
          .forEach((id) => this.selected.add(id));
      }
    } catch (_) {
      const raw = String(app.data.settings[this.attrs.settingKey] || '').trim();
      if (raw) this.selected.add(raw);
    }

    this._onDocClick = (e: Event) => {
      if (this.element && !this.element.contains(e.target as Node | null)) {
        if (this.open) {
          this.open = false;
          m.redraw();
        }
      }
    };

    app.store
      .find('tags')
      .then((result) => {
        this.tags = (Array.isArray(result) ? result : [])
          .filter((t) => t && t.id?.() && !t.parent?.())
          .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));
        this.tagsLoaded = true;
        m.redraw();
      })
      .catch(() => {
        this.tagsLoaded = true;
        m.redraw();
      });
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);
    this.element = vnode.dom;
    if (this._onDocClick) document.addEventListener('click', this._onDocClick, true);
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    if (this._onDocClick) document.removeEventListener('click', this._onDocClick, true);
  }

  toggle(id: any) {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    m.redraw();
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.persist(), 350);
  }

  persist() {
    this.saving = true;
    m.redraw();
    const value = JSON.stringify([...this.selected]);
    saveSetting({ [this.attrs.settingKey]: value })
      .then(() => {
        app.data.settings[this.attrs.settingKey] = value;
        this.saving = false;
        m.redraw();
      })
      .catch(() => {
        this.saving = false;
        m.redraw();
      });
  }

  view() {
    const { label, help, placeholder } = this.attrs;
    const selectedTags = this.tags.filter((t) => this.selected.has(String(t.id?.())));
    const query = this.search.toLowerCase();
    const filteredTags = this.tags.filter((t) => !query || (t.name?.() || '').toLowerCase().includes(query));

    return (
      <div className="Form-group">
        <label className="AvocadoAdmin-label AvocadoAdmin-label--saving">
          {label}
          {this.saving && <span className="AvocadoAdmin-savingDot" aria-hidden="true" />}
        </label>

        <div className="AvocadoAdmin-tagPicker">
          {/* ── Trigger ── */}
          <button
            type="button"
            className={`AvocadoAdmin-tagPickerTrigger${this.open ? ' is-open' : ''}`}
            onclick={(e: any) => {
              e.stopPropagation();
              this.open = !this.open;
              this.search = '';
              m.redraw();
            }}
          >
            <i className="fas fa-tag" aria-hidden="true" />

            {selectedTags.length > 0 ? (
              selectedTags.map((tag) => {
                const color = tag.color?.() || 'var(--primary-color)';
                return (
                  <span
                    key={String(tag.id?.())}
                    className="AvocadoAdmin-tagChip"
                    style={{ '--tag-color': color }}
                    onclick={(e: any) => {
                      e.stopPropagation();
                      this.toggle(String(tag.id?.()));
                    }}
                  >
                    {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                    {tag.name?.()}
                    <i className="fas fa-times AvocadoAdmin-tagChipRemove" aria-hidden="true" />
                  </span>
                );
              })
            ) : (
              <span className="AvocadoAdmin-tagPickerPlaceholder">
                {placeholder || trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
              </span>
            )}

            <i className={`fas fa-chevron-${this.open ? 'up' : 'down'} AvocadoAdmin-tagPickerChevron`} aria-hidden="true" />
          </button>

          {/* ── Dropdown ── */}
          {this.open && (
            <div className="AvocadoAdmin-tagPickerDropdown">
              <div className="AvocadoAdmin-tagPickerSearch">
                <i className="fas fa-search" aria-hidden="true" />
                <input
                  type="text"
                  value={this.search}
                  placeholder={trans('ramon-avocado.admin.search_tags', 'Search tags…')}
                  oninput={(e: any) => {
                    this.search = e.target.value;
                    m.redraw();
                  }}
                  onclick={(e: any) => e.stopPropagation()}
                />
              </div>

              {!this.tagsLoaded ? (
                <span className="AvocadoAdmin-tagPickerEmpty">{trans('ramon-avocado.admin.loading', 'Loading…')}</span>
              ) : filteredTags.length === 0 ? (
                <span className="AvocadoAdmin-tagPickerEmpty">{trans('ramon-avocado.admin.settings.featured_tags_empty', 'No tags found.')}</span>
              ) : (
                <ul className="AvocadoAdmin-tagPickerList">
                  {filteredTags.map((tag) => {
                    const id = String(tag.id?.() || '');
                    if (!id) return null;
                    const color = tag.color?.() || '#8f9097';
                    const icon = tag.icon?.();
                    const isSelected = this.selected.has(id);
                    return (
                      <li
                        key={id}
                        className={`AvocadoAdmin-tagPickerItem${isSelected ? ' is-selected' : ''}`}
                        onclick={(e: any) => {
                          e.stopPropagation();
                          this.toggle(id);
                        }}
                      >
                        <span className="AvocadoAdmin-tagPickerItem-icon" style={{ background: color }}>
                          {icon && <i className={icon} aria-hidden="true" />}
                        </span>
                        <span className="AvocadoAdmin-tagPickerItem-name">{tag.name?.()}</span>
                        {isSelected && <i className="fas fa-check AvocadoAdmin-tagPickerItem-check" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}
