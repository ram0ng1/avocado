import UploadImageButton from 'flarum/common/components/UploadImageButton';

const trans = (key, fallback) => {
  const out = app.translator?.trans(key);
  return out && out !== key ? out : fallback;
};

const resolveAssetUrl = (assetPath) => {
  if (!assetPath) return null;

  if (/^https?:\/\//i.test(assetPath)) return assetPath;

  const assetsBaseUrl = app.forum.attribute('assetsBaseUrl');
  if (assetsBaseUrl) {
    return assetsBaseUrl.replace(/\/+$/, '') + '/' + String(assetPath).replace(/^\/+/, '');
  }

  const forumBaseUrl = app.forum.attribute('baseUrl');
  if (forumBaseUrl) {
    return forumBaseUrl.replace(/\/+$/, '') + '/assets/' + String(assetPath).replace(/^\/+/, '');
  }

  return String(assetPath);
};

app.initializers.add(
  'ramon-avocado',
  (app) => {
    app.registry.for('ramon-avocado')

      // ── ─────────────────────────────────────────────────────────────────────
      // Homepage
      // ─────────────────────────────────────────────────────────────────────────

      .registerSetting(() => (
        <div className="AvocadoAdmin-section">
          <h3>{trans('ramon-avocado.admin.settings.section_homepage', 'Homepage')}</h3>
        </div>
      ), 115)

      .registerSetting({
        setting: 'avocado.home_enabled',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.home_enabled_label', 'Enable Avocado V2 homepage'),
        help: trans('ramon-avocado.admin.settings.home_enabled_help', 'Replace the default discussion list on the home page with the Avocado V2 feed layout (cards, categories, composer).'),
      }, 110)

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
      }, 30);
  },
  -999999
);
