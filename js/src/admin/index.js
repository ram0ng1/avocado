import UploadImageButton from 'flarum/common/components/UploadImageButton';
import Component from 'flarum/common/Component';

const trans = (key, fallback) => {
  const out = app.translator?.trans(key);
  return out && out !== key ? out : fallback;
};

// Normalize paths and remove traversal sequences
const normalizePath = (path) => {
  return String(path)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .split('/')
    .filter((segment, i) => {
      if (segment === '.' || segment === '') return i === 0;
      if (segment === '..') return false;
      return true;
    })
    .join('/');
};

const resolveAssetUrl = (assetPath) => {
  if (!assetPath) return null;

  if (/^https?:\/\//i.test(assetPath)) return assetPath;

  // Block dangerous protocols (javascript:, data:, vbscript:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetPath)) return null;

  const normalized = normalizePath(assetPath);

  const assetsBaseUrl = app.forum.attribute('assetsBaseUrl');
  if (assetsBaseUrl) {
    return assetsBaseUrl.replace(/\/+$/, '') + '/' + normalized;
  }

  const forumBaseUrl = app.forum.attribute('baseUrl');
  if (forumBaseUrl) {
    return forumBaseUrl.replace(/\/+$/, '') + '/assets/' + normalized;
  }

  // Reject unsafe fallback instead of returning raw path
  return null;
};

// ─── Featured Tags Selector ───────────────────────────────────────────────────

class FeaturedTagsSelector extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.saving    = false;
    this.tagsLoaded = false;
    this.selected  = new Set();
    this.tags      = [];
    this._saveTimer = null;

    try {
      const raw = app.data.settings['avocado.featured_tags'];
      if (raw) JSON.parse(raw).forEach((id) => this.selected.add(String(id)));
    } catch (_) {}

    app.store.find('tags').then((result) => {
      this.tags = (Array.isArray(result) ? result : [])
        .filter((t) => t && !t.parent?.())
        .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));
      this.tagsLoaded = true;
      m.redraw();
    }).catch(() => {
      this.tagsLoaded = true;
      m.redraw();
    });
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
    const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
    app.request({
      method: 'POST',
      url: `${apiUrl}/settings`,
      body: { 'avocado.featured_tags': value },
    }).then(() => {
      app.data.settings['avocado.featured_tags'] = value;
      this.saving = false;
      m.redraw();
    }).catch(() => {
      this.saving = false;
      m.redraw();
    });
  }

  view() {
    return (
      <div className="Form-group AvocadoAdmin-featuredTags">
        <label className="AvocadoAdmin-featuredTags-label">
          {trans('ramon-avocado.admin.settings.featured_tags_label', 'Featured Categories')}
          {this.saving && <span className="AvocadoAdmin-featuredTags-saving" aria-hidden="true" />}
        </label>
        <div className="AvocadoAdmin-tagPills">
          {!this.tagsLoaded && (
            <span className="AvocadoAdmin-tagPills-placeholder">Loading…</span>
          )}
          {this.tagsLoaded && this.tags.length === 0 && (
            <span className="AvocadoAdmin-tagPills-placeholder">
              {trans('ramon-avocado.admin.settings.featured_tags_empty', 'No tags found.')}
            </span>
          )}
          {this.tags.map((tag) => {
            const id = String(tag.id?.() || '');
            if (!id) return null;
            const active = this.selected.has(id);
            const color  = tag.color?.() || '#8f9097';
            const icon   = tag.icon?.();
            return (
              <button
                key={id}
                type="button"
                className={`AvocadoAdmin-tagPill${active ? ' is-active' : ''}`}
                style={{ '--pill-color': color }}
                onclick={() => this.toggle(id)}
              >
                {icon && <i className={`${icon} AvocadoAdmin-tagPill-icon`} aria-hidden="true" />}
                <span className="AvocadoAdmin-tagPill-name">{tag.name?.()}</span>
                <i className={`fas fa-star AvocadoAdmin-tagPill-star${active ? ' is-active' : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <p className="helpText">
          {trans('ramon-avocado.admin.settings.featured_tags_help', 'Selected categories appear highlighted with a star badge on the homepage and categories page.')}
        </p>
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

app.initializers.add(
  'ramon-avocado',
  (app) => {
    app.registry.for('ramon-avocado')

      // ── ─────────────────────────────────────────────────────────────────────
      // Logo
      // ─────────────────────────────────────────────────────────────────────────

      .registerSetting(() => (
        <div className="AvocadoAdmin-section">
          <h3>{trans('ramon-avocado.admin.settings.section_logo', 'Logo')}</h3>
        </div>
      ), 135)

      .registerSetting({
        setting: 'avocado.logo_enabled',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.logo_enabled_label', 'Enable custom SVG logo'),
        help: trans('ramon-avocado.admin.settings.logo_enabled_help', 'Replace the default forum logo with the uploaded SVG file.'),
      }, 130)

      .registerSetting(() => (
        <div className="Form-group">
          <label>{trans('ramon-avocado.admin.settings.logo_svg_label', 'Custom Logo (SVG)')}</label>
          <UploadImageButton
            name="avocado-logo"
            routePath="avocado/logo-svg"
            value={app.data.settings['avocado.logo_svg']}
            url={resolveAssetUrl(app.data.settings['avocado.logo_svg'])}
          />
          <p className="helpText">
            {trans('ramon-avocado.admin.settings.logo_svg_help', 'Upload an SVG file to replace the forum logo in the header. Enable the toggle above to activate it.')}
          </p>
        </div>
      ), 125)

      // ── ─────────────────────────────────────────────────────────────────────
      // Homepage
      // ─────────────────────────────────────────────────────────────────────────

      .registerSetting(() => (
        <div className="AvocadoAdmin-section">
          <h3>{trans('ramon-avocado.admin.settings.section_homepage', 'Homepage')}</h3>
        </div>
      ), 115)

      .registerSetting(() => <FeaturedTagsSelector />, 112)

      .registerSetting({
        setting: 'avocado.show_online_users',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.show_online_users_label', 'Show Online Users section on homepage'),
        help: trans('ramon-avocado.admin.settings.show_online_users_help', 'Display a list of currently online users between the Categories and Popular Discussions sections. Only shows users who have enabled "Allow others to see when I am online".'),
      }, 108)

      .registerSetting({
        setting: 'avocado.show_guest_cta',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.show_guest_cta_label', 'Show Login / Sign Up buttons in hero banner'),
        help: trans('ramon-avocado.admin.settings.show_guest_cta_help', 'Display Log In and Sign Up call-to-action buttons inside the homepage hero banner for guests.'),
      }, 107)

      .registerSetting({
        setting: 'avocado.custom_default_avatar',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.custom_default_avatar_label', 'Use custom default avatar for users without a photo'),
        help: trans('ramon-avocado.admin.settings.custom_default_avatar_help', 'Show a person silhouette icon (coloured with the primary colour) instead of the user\'s initial letter when no avatar is uploaded.'),
      }, 106)

      .registerSetting({
        setting: 'avocado.show_post_cta',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.show_post_cta_label', 'Show Join CTA after first post for guests'),
        help: trans('ramon-avocado.admin.settings.show_post_cta_help', 'Display a Log In / Sign Up call-to-action card after the first post in a discussion, visible only to guests.'),
      }, 106)

      .registerSetting({
        setting: 'avocado.post_cta_position',
        type: 'select',
        label: trans('ramon-avocado.admin.settings.post_cta_position_label', 'CTA position (after which post number)'),
        help: trans('ramon-avocado.admin.settings.post_cta_position_help', 'Insert the CTA banner between this post number and the next one.'),
        options: {
          '1': trans('ramon-avocado.admin.settings.post_cta_position_1', 'After post #1'),
          '2': trans('ramon-avocado.admin.settings.post_cta_position_2', 'After post #2'),
          '3': trans('ramon-avocado.admin.settings.post_cta_position_3', 'After post #3'),
          '4': trans('ramon-avocado.admin.settings.post_cta_position_4', 'After post #4'),
          '5': trans('ramon-avocado.admin.settings.post_cta_position_5', 'After post #5'),
        },
        default: '1',
      }, 105)

      .registerSetting({
        setting: 'avocado.show_auth_buttons',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.show_auth_buttons_label', 'Show Login / Sign Up buttons in header for guests'),
        help: trans('ramon-avocado.admin.settings.show_auth_buttons_help', 'Display Log In and Sign Up pill buttons in the header secondary nav for guests.'),
      }, 105)

      // ── Banner image ─────────────────────────────────────────────────────────

      .registerSetting(() => (
        <div className="Form-group">
          <label>{trans('ramon-avocado.admin.settings.banner_image_label', 'Banner Image')}</label>
          <UploadImageButton
            name="avocado-banner"
            routePath="avocado/banner"
            value={app.data.settings['avocado.hero_image']}
            url={resolveAssetUrl(app.data.settings['avocado.hero_image'])}
          />
          <p className="helpText">
            {trans('ramon-avocado.admin.settings.banner_image_help', 'Upload the hero banner image shown at the top of the forum homepage and in the hero section.')}
          </p>
        </div>
      ), 100)

      .registerSetting({
        setting: 'avocado.hero_image_position',
        type: 'text',
        label: trans('ramon-avocado.admin.settings.hero_image_position_label', 'Hero Image Position'),
        help: trans('ramon-avocado.admin.settings.hero_image_position_help', "CSS background-position, e.g. 'center top' or 'center 20%'."),
      }, 95)

      // ── ─────────────────────────────────────────────────────────────────────
      // Auth Modals
      // ─────────────────────────────────────────────────────────────────────────

      .registerSetting(() => (
        <div className="AvocadoAdmin-section">
          <h3>{trans('ramon-avocado.admin.settings.section_auth', 'Login & Registration')}</h3>
        </div>
      ), 90)

      .registerSetting(() => (
        <div className="Form-group">
          <label>{trans('ramon-avocado.admin.settings.auth_image_label', 'Auth Modal Image')}</label>
          <UploadImageButton
            name="avocado-auth"
            routePath="avocado/auth-image"
            value={app.data.settings['avocado.auth_image']}
            url={resolveAssetUrl(app.data.settings['avocado.auth_image'])}
          />
          <p className="helpText">
            {trans('ramon-avocado.admin.settings.auth_image_help', 'Background image shown in the right panel of the login, sign up, and forgot password modals.')}
          </p>
        </div>
      ), 85)

      // ── ─────────────────────────────────────────────────────────────────────
      // Search
      // ─────────────────────────────────────────────────────────────────────────

      .registerSetting(() => (
        <div className="AvocadoAdmin-section">
          <h3>{trans('ramon-avocado.admin.settings.section_search', 'Search')}</h3>
        </div>
      ), 55)

      .registerSetting({
        setting: 'avocado.search_v1',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.search_v1_label', 'Enable V1 search bar style'),
        help: trans('ramon-avocado.admin.settings.search_v1_help', 'Show the inline search dropdown instead of the V2 modal.'),
      }, 50)

      // ── ─────────────────────────────────────────────────────────────────────
      // Posts
      // ─────────────────────────────────────────────────────────────────────────

      .registerSetting(() => (
        <div className="AvocadoAdmin-section">
          <h3>{trans('ramon-avocado.admin.settings.section_posts', 'Posts')}</h3>
        </div>
      ), 45)

      .registerSetting({
        setting: 'avocado.show_share',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.show_share_label', 'Show Share button on posts'),
        help: trans('ramon-avocado.admin.settings.show_share_help', 'Add a Share action button to each post.'),
      }, 40)

      .registerSetting({
        setting: 'avocado.show_action_icons',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.show_action_icons_label', 'Show icons on Like and Reply buttons'),
        help: trans('ramon-avocado.admin.settings.show_action_icons_help', 'Display Font Awesome icons on the Like and Reply action buttons.'),
      }, 35)

      .registerSetting({
        setting: 'avocado.fixed_avatar_effect',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.fixed_avatar_effect_label', 'Enable fixed avatar effect in discussion posts'),
        help: trans('ramon-avocado.admin.settings.fixed_avatar_effect_help', 'Keep the post avatar sticky while reading long comments on desktop.'),
      }, 30)

      .registerSetting({
        setting: 'avocado.hide_links_for_guests',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.hide_links_for_guests_label', 'Hide links for guests'),
        help: trans('ramon-avocado.admin.settings.hide_links_for_guests_help', 'Prevent guests from following links in posts. Clicking a link shows a Login / Sign Up prompt instead.'),
      }, 25);
  },
  -999999
);
