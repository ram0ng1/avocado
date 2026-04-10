import UploadImageButton from 'flarum/common/components/UploadImageButton';
import Component from 'flarum/common/Component';
import Switch from 'flarum/common/components/Switch';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import { override } from 'flarum/common/extend';

// ─── Translation helper ───────────────────────────────────────────────────────
const trans = (key, fallback) => {
  const out = app.translator?.trans(key);
  return out && out !== key ? out : fallback;
};

// ─── URL helpers ──────────────────────────────────────────────────────────────
const normalizePath = (path) =>
  String(path)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .split('/')
    .filter((seg, i) => {
      if (seg === '.' || seg === '') return i === 0;
      if (seg === '..') return false;
      return true;
    })
    .join('/');

const resolveAssetUrl = (assetPath) => {
  if (!assetPath) return null;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetPath)) return null;
  const normalized = normalizePath(assetPath);
  const base = app.forum.attribute('assetsBaseUrl') || app.forum.attribute('baseUrl') + '/assets';
  return base.replace(/\/+$/, '') + '/' + normalized;
};

// ─── Settings helpers ─────────────────────────────────────────────────────────
const getBool = (key) => {
  const v = app.data.settings[key];
  return v === true || v === 'true' || v === '1' || v === 1;
};

const getStr = (key, def = '') => String(app.data.settings[key] ?? def);

// Direct-save to API (used by all custom controls)
const saveSetting = (payload) => {
  const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
  return app.request({ method: 'POST', url: `${apiUrl}/settings`, body: payload });
};

// ─── AdminToggle ──────────────────────────────────────────────────────────────
// Self-contained boolean toggle: updates app.data.settings + persists immediately.
class AdminToggle extends Component {
  view() {
    const { settingKey, label, help } = this.attrs;
    const value = getBool(settingKey);
    return (
      <div className="Form-group AvocadoAdmin-toggle">
        <Switch
          state={value}
          onchange={(checked) => {
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

// ─── AdminSelect ──────────────────────────────────────────────────────────────
class AdminSelect extends Component {
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
            onchange={(e) => {
              const val = e.target.value;
              app.data.settings[settingKey] = val;
              m.redraw();
              saveSetting({ [settingKey]: val });
            }}
          >
            {keys.map((k) => (
              <option key={k} value={k}>{options[k]}</option>
            ))}
          </select>
          <i className="fas fa-chevron-down AvocadoAdmin-select-chevron" aria-hidden="true" />
        </div>
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

// ─── AdminText ────────────────────────────────────────────────────────────────
class AdminText extends Component {
  oninit(vnode) {
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
          oninput={(e) => {
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

// ─── AdminCard ────────────────────────────────────────────────────────────────
// POJO component (Mithril requires view method — arrow functions are React syntax)
const AdminCard = {
  view({ attrs: { title, icon }, children }) {
    return (
      <div className="AvocadoAdmin-card">
        <div className="AvocadoAdmin-card-header">
          {icon && <span className="AvocadoAdmin-card-icon"><i className={icon} aria-hidden="true" /></span>}
          <h3 className="AvocadoAdmin-card-title">{title}</h3>
        </div>
        <div className="AvocadoAdmin-card-body">
          {children}
        </div>
      </div>
    );
  },
};

// ─── Divider between groups of sub-settings ───────────────────────────────────
const SubDivider = { view() { return <div className="AvocadoAdmin-subDivider" />; } };

// ─── AdminTagPicker ───────────────────────────────────────────────────────────
// Multi-select tag picker that matches the AvocadoHome-tagPickerTrigger style
// from the forum composer. Saves as a JSON array.
class AdminTagPicker extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.open       = false;
    this.search     = '';
    this.saving     = false;
    this.tagsLoaded = false;
    this.tags       = [];
    this.selected   = new Set();
    this._saveTimer = null;

    // Load initial selection — supports both JSON array and legacy plain string
    try {
      const raw = app.data.settings[this.attrs.settingKey];
      if (raw) {
        const parsed = JSON.parse(raw);
        (Array.isArray(parsed) ? parsed : [parsed])
          .map(String).filter(Boolean).forEach((id) => this.selected.add(id));
      }
    } catch (_) {
      const raw = String(app.data.settings[this.attrs.settingKey] || '').trim();
      if (raw) this.selected.add(raw);
    }

    this._onDocClick = (e) => {
      if (this.element && !this.element.contains(e.target)) {
        if (this.open) { this.open = false; m.redraw(); }
      }
    };

    app.store.find('tags').then((result) => {
      this.tags = (Array.isArray(result) ? result : [])
        .filter((t) => t && t.id?.() && !t.parent?.())
        .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));
      this.tagsLoaded = true;
      m.redraw();
    }).catch(() => { this.tagsLoaded = true; m.redraw(); });
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this.element = vnode.dom;
    document.addEventListener('click', this._onDocClick, true);
  }

  onremove(vnode) {
    super.onremove(vnode);
    document.removeEventListener('click', this._onDocClick, true);
  }

  toggle(id) {
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
    saveSetting({ [this.attrs.settingKey]: value }).then(() => {
      app.data.settings[this.attrs.settingKey] = value;
      this.saving = false;
      m.redraw();
    }).catch(() => { this.saving = false; m.redraw(); });
  }

  view() {
    const { label, help, placeholder } = this.attrs;
    const selectedTags = this.tags.filter((t) => this.selected.has(String(t.id?.())));
    const query        = this.search.toLowerCase();
    const filteredTags = this.tags.filter((t) =>
      !query || (t.name?.() || '').toLowerCase().includes(query)
    );

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
            onclick={(e) => { e.stopPropagation(); this.open = !this.open; this.search = ''; m.redraw(); }}
          >
            <i className="fas fa-tag" aria-hidden="true" />

            {selectedTags.length > 0
              ? selectedTags.map((tag) => {
                  const color = tag.color?.() || 'var(--primary-color)';
                  return (
                    <span
                      key={String(tag.id?.())}
                      className="AvocadoAdmin-tagChip"
                      style={{ '--tag-color': color }}
                      onclick={(e) => { e.stopPropagation(); this.toggle(String(tag.id?.())); }}
                    >
                      {tag.icon?.() && <i className={tag.icon()} aria-hidden="true" />}
                      {tag.name?.()}
                      <i className="fas fa-times AvocadoAdmin-tagChipRemove" aria-hidden="true" />
                    </span>
                  );
                })
              : <span className="AvocadoAdmin-tagPickerPlaceholder">
                  {placeholder || trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
                </span>
            }

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
                  oninput={(e) => { this.search = e.target.value; m.redraw(); }}
                  onclick={(e) => e.stopPropagation()}
                />
              </div>

              {!this.tagsLoaded
                ? <span className="AvocadoAdmin-tagPickerEmpty">{trans('ramon-avocado.admin.loading', 'Loading…')}</span>
                : filteredTags.length === 0
                  ? <span className="AvocadoAdmin-tagPickerEmpty">{trans('ramon-avocado.admin.settings.featured_tags_empty', 'No tags found.')}</span>
                  : (
                    <ul className="AvocadoAdmin-tagPickerList">
                      {filteredTags.map((tag) => {
                        const id         = String(tag.id?.() || '');
                        if (!id) return null;
                        const color      = tag.color?.() || '#8f9097';
                        const icon       = tag.icon?.();
                        const isSelected = this.selected.has(id);
                        return (
                          <li
                            key={id}
                            className={`AvocadoAdmin-tagPickerItem${isSelected ? ' is-selected' : ''}`}
                            onclick={(e) => { e.stopPropagation(); this.toggle(id); }}
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
                  )
              }
            </div>
          )}
        </div>

        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

// All settings use auto-saving components — the native Save button is unnecessary
// and confusing, so suppress it for this extension page only.
override(ExtensionPage.prototype, 'submitButton', function (original) {
  if (this.extension?.id === 'ramon-avocado') return null;
  return original();
});

app.initializers.add('ramon-avocado', (app) => {
  const reg = app.registry.for('ramon-avocado');

  // ── Logo ───────────────────────────────────────────────────────────────────
  reg.registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_logo', 'Logo')} icon="fas fa-image">
      <AdminToggle
        settingKey="avocado.logo_enabled"
        label={trans('ramon-avocado.admin.settings.logo_enabled_label', 'Enable custom SVG logo')}
        help={trans('ramon-avocado.admin.settings.logo_enabled_help', 'Replace the default forum logo with the uploaded SVG file.')}
      />
      {getBool('avocado.logo_enabled') && (
        <>
          <SubDivider />
          <div className="Form-group">
            <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.logo_svg_label', 'Custom Logo (SVG)')}</label>
            <UploadImageButton
              name="avocado-logo"
              routePath="avocado/logo-svg"
              value={app.data.settings['avocado.logo_svg']}
              url={resolveAssetUrl(app.data.settings['avocado.logo_svg'])}
            />
            <p className="helpText">
              {trans('ramon-avocado.admin.settings.logo_svg_help', 'Upload an SVG file to replace the forum logo in the header.')}
            </p>
          </div>
        </>
      )}
    </AdminCard>
  ), 135)

  // ── Homepage ───────────────────────────────────────────────────────────────
  .registerSetting(() => {
    const showcaseSelected = !!getStr('avocado.showcase_tag');
    return (
      <AdminCard title={trans('ramon-avocado.admin.settings.section_homepage', 'Homepage')} icon="fas fa-home">

        {/* Featured categories */}
        <AdminTagPicker
          settingKey="avocado.featured_tags"
          label={trans('ramon-avocado.admin.settings.featured_tags_label', 'Featured Categories')}
          help={trans('ramon-avocado.admin.settings.featured_tags_help', 'Selected categories appear highlighted on the homepage and categories page.')}
          placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select categories…')}
        />

        <SubDivider />

        {/* Showcase / portfolio — master toggle */}
        <AdminToggle
          settingKey="avocado.showcase_enabled"
          label={trans('ramon-avocado.admin.settings.showcase_enabled_label', 'Enable Showcase / Portfolio section')}
          help={trans('ramon-avocado.admin.settings.showcase_enabled_help', 'Show a showcase slider on the homepage with discussions from selected tags.')}
        />

        {/* All showcase settings — only visible when enabled */}
        {getBool('avocado.showcase_enabled') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminTagPicker
              settingKey="avocado.showcase_tag"
              label={trans('ramon-avocado.admin.settings.showcase_tag_label', 'Showcase / Portfolio Tags')}
              help={trans('ramon-avocado.admin.settings.showcase_tag_help', 'Discussions from these tags appear in the showcase slider on the homepage.')}
              placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
            />
            {showcaseSelected && (
              <>
                <AdminText
                  settingKey="avocado.showcase_heading"
                  label={trans('ramon-avocado.admin.settings.showcase_heading_label', 'Showcase Section Title')}
                  help={trans('ramon-avocado.admin.settings.showcase_heading_help', 'Custom title for the showcase section. Leave empty to use default.')}
                />
                <AdminSelect
                  settingKey="avocado.showcase_count"
                  label={trans('ramon-avocado.admin.settings.showcase_count_label', 'Number of Showcase Items')}
                  help={trans('ramon-avocado.admin.settings.showcase_count_help', 'Display 1 to 5 discussion cards in the showcase section.')}
                  options={{ '1': '1', '2': '2', '3': '3', '4': '4', '5': '5' }}
                  default="5"
                />
                <AdminSelect
                  settingKey="avocado.showcase_image_style"
                  label={trans('ramon-avocado.admin.settings.showcase_image_style_label', 'Card Image Style')}
                  help={trans('ramon-avocado.admin.settings.showcase_image_style_help', 'Choose between compact or full-height image display.')}
                  options={{
                    'default': trans('ramon-avocado.admin.settings.showcase_image_style_default', 'Default (Compact)'),
                    'full':    trans('ramon-avocado.admin.settings.showcase_image_style_full', 'Full Image'),
                  }}
                  default="default"
                />
              </>
            )}
          </div>
        )}

        <SubDivider />

        {/* General homepage toggles */}
        <AdminToggle
          settingKey="avocado.show_online_users"
          label={trans('ramon-avocado.admin.settings.show_online_users_label', 'Show Online Users section')}
          help={trans('ramon-avocado.admin.settings.show_online_users_help', 'Display currently online users between Categories and Popular Discussions.')}
        />
        <AdminToggle
          settingKey="avocado.show_guest_cta"
          label={trans('ramon-avocado.admin.settings.show_guest_cta_label', 'Show Login / Sign Up buttons in hero banner')}
          help={trans('ramon-avocado.admin.settings.show_guest_cta_help', 'Display call-to-action buttons inside the homepage hero banner for guests.')}
        />
        <AdminToggle
          settingKey="avocado.custom_default_avatar"
          label={trans('ramon-avocado.admin.settings.custom_default_avatar_label', 'Use custom default avatar')}
          help={trans('ramon-avocado.admin.settings.custom_default_avatar_help', 'Show a person silhouette icon instead of the initial letter when no avatar is uploaded.')}
        />
        <AdminToggle
          settingKey="avocado.show_auth_buttons"
          label={trans('ramon-avocado.admin.settings.show_auth_buttons_label', 'Show Login / Sign Up buttons in header for guests')}
          help={trans('ramon-avocado.admin.settings.show_auth_buttons_help', 'Display Log In and Sign Up pill buttons in the header for guests.')}
        />

        <SubDivider />

        {/* Banner image */}
        <div className="Form-group">
          <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.banner_image_label', 'Banner Image')}</label>
          <UploadImageButton
            name="avocado-banner"
            routePath="avocado/banner"
            value={app.data.settings['avocado.hero_image']}
            url={resolveAssetUrl(app.data.settings['avocado.hero_image'])}
          />
          <p className="helpText">
            {trans('ramon-avocado.admin.settings.banner_image_help', 'Upload the hero banner image shown at the top of the forum homepage.')}
          </p>
        </div>
        {app.data.settings['avocado.hero_image'] && (
          <AdminText
            settingKey="avocado.hero_image_position"
            label={trans('ramon-avocado.admin.settings.hero_image_position_label', 'Hero Image Position')}
            help={trans('ramon-avocado.admin.settings.hero_image_position_help', "CSS background-position value, e.g. 'center top' or 'center 20%'.")}
            placeholder="center top"
          />
        )}

        <SubDivider />

        {/* Guest post CTA */}
        <AdminToggle
          settingKey="avocado.show_post_cta"
          label={trans('ramon-avocado.admin.settings.show_post_cta_label', 'Show Join CTA after first post for guests')}
          help={trans('ramon-avocado.admin.settings.show_post_cta_help', 'Display a Log In / Sign Up card after the first post, visible only to guests.')}
        />
        {getBool('avocado.show_post_cta') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminSelect
              settingKey="avocado.post_cta_position"
              label={trans('ramon-avocado.admin.settings.post_cta_position_label', 'CTA position (after which post number)')}
              help={trans('ramon-avocado.admin.settings.post_cta_position_help', 'Insert the CTA banner between this post number and the next one.')}
              options={{
                '1': trans('ramon-avocado.admin.settings.post_cta_position_1', 'After post #1'),
                '2': trans('ramon-avocado.admin.settings.post_cta_position_2', 'After post #2'),
                '3': trans('ramon-avocado.admin.settings.post_cta_position_3', 'After post #3'),
                '4': trans('ramon-avocado.admin.settings.post_cta_position_4', 'After post #4'),
                '5': trans('ramon-avocado.admin.settings.post_cta_position_5', 'After post #5'),
              }}
              default="1"
            />
          </div>
        )}
      </AdminCard>
    );
  }, 115)

  // ── Login & Registration ───────────────────────────────────────────────────
  .registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_auth', 'Login & Registration')} icon="fas fa-key">
      <div className="Form-group">
        <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.auth_image_label', 'Auth Modal Image')}</label>
        <UploadImageButton
          name="avocado-auth"
          routePath="avocado/auth-image"
          value={app.data.settings['avocado.auth_image']}
          url={resolveAssetUrl(app.data.settings['avocado.auth_image'])}
        />
        <p className="helpText">
          {trans('ramon-avocado.admin.settings.auth_image_help', 'Background image shown in the right panel of login, sign up, and forgot password modals.')}
        </p>
      </div>
    </AdminCard>
  ), 90)

  // ── Search ─────────────────────────────────────────────────────────────────
  .registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_search', 'Search')} icon="fas fa-search">
      <AdminToggle
        settingKey="avocado.search_v1"
        label={trans('ramon-avocado.admin.settings.search_v1_label', 'Enable V1 search bar style')}
        help={trans('ramon-avocado.admin.settings.search_v1_help', 'Show the inline search dropdown instead of the V2 modal.')}
      />
    </AdminCard>
  ), 55)

  // ── Posts ──────────────────────────────────────────────────────────────────
  .registerSetting(() => (
    <AdminCard title={trans('ramon-avocado.admin.settings.section_posts', 'Posts')} icon="fas fa-comment-alt">
      <AdminToggle
        settingKey="avocado.show_share"
        label={trans('ramon-avocado.admin.settings.show_share_label', 'Show Share button on posts')}
        help={trans('ramon-avocado.admin.settings.show_share_help', 'Add a Share action button to each post.')}
      />
      <AdminToggle
        settingKey="avocado.show_action_icons"
        label={trans('ramon-avocado.admin.settings.show_action_icons_label', 'Show icons on Like and Reply buttons')}
        help={trans('ramon-avocado.admin.settings.show_action_icons_help', 'Display Font Awesome icons on the Like and Reply action buttons.')}
      />
      <AdminToggle
        settingKey="avocado.fixed_avatar_effect"
        label={trans('ramon-avocado.admin.settings.fixed_avatar_effect_label', 'Enable fixed avatar effect in discussion posts')}
        help={trans('ramon-avocado.admin.settings.fixed_avatar_effect_help', 'Keep the post avatar sticky while reading long comments on desktop.')}
      />

      <SubDivider />

      <AdminToggle
        settingKey="avocado.hero_decoration_icon"
        label={trans('ramon-avocado.admin.settings.hero_decoration_icon_label', 'Show secondary tag icon on discussion hero')}
        help={trans('ramon-avocado.admin.settings.hero_decoration_icon_help', 'Display the secondary tag icon as a large decorative element on the right side of the discussion header.')}
      />
      {getBool('avocado.hero_decoration_icon') && (
        <div className="AvocadoAdmin-subGroup">
          <AdminSelect
            settingKey="avocado.hero_decoration_icon_count"
            label={trans('ramon-avocado.admin.settings.hero_decoration_icon_count_label', 'Number of decoration icons')}
            help={trans('ramon-avocado.admin.settings.hero_decoration_icon_count_help', '1 icon uses the first child tag. 2 icons also shows the second child tag icon, offset to the left.')}
            options={{
              '1': trans('ramon-avocado.admin.settings.hero_decoration_icon_count_one', '1 icon (first child tag)'),
              '2': trans('ramon-avocado.admin.settings.hero_decoration_icon_count_two', '2 icons (first and second child tag)'),
            }}
            default="1"
          />
          <AdminText
            settingKey="avocado.hero_decoration_icon_opacity"
            label={trans('ramon-avocado.admin.settings.hero_decoration_icon_opacity_label', 'Icon opacity (0–100)')}
            help={trans('ramon-avocado.admin.settings.hero_decoration_icon_opacity_help', 'Opacity of the decoration icon as a percentage. 100 = fully opaque.')}
            placeholder="15"
          />
        </div>
      )}

      <SubDivider />

      <AdminToggle
        settingKey="avocado.hide_links_for_guests"
        label={trans('ramon-avocado.admin.settings.hide_links_for_guests_label', 'Hide links for guests')}
        help={trans('ramon-avocado.admin.settings.hide_links_for_guests_help', 'Prevent guests from following links in posts. Clicking shows a Login / Sign Up prompt instead.')}
      />
    </AdminCard>
  ), 45);
});
