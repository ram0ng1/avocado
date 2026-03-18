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
      // ── Banner upload ────────────────────────────────────────────────────────
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
            {trans('ramon-avocado.admin.settings.banner_image_help', 'Upload the hero banner image displayed at the top of the forum.')}
          </p>
        </div>
      ), 100)
      .registerSetting({
        setting: 'avocado.hero_image_position',
        type: 'text',
        label: trans('ramon-avocado.admin.settings.hero_image_position_label', 'Hero Image Position'),
        help: trans('ramon-avocado.admin.settings.hero_image_position_help', "CSS background-position, e.g. 'center top' or 'center 20%'."),
      }, 90)
      // ── Other options ────────────────────────────────────────────────────────
      .registerSetting({
        setting: 'avocado.search_v1',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.search_v1_label', 'Enable V1 search bar style'),
        help: trans('ramon-avocado.admin.settings.search_v1_help', 'Show the inline search dropdown instead of the V2 modal.'),
      }, 50)
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
      }, 30)
      .registerSetting({
        setting: 'avocado.fixed_avatar_effect',
        type: 'boolean',
        label: trans('ramon-avocado.admin.settings.fixed_avatar_effect_label', 'Enable fixed avatar effect in discussion posts'),
        help: trans('ramon-avocado.admin.settings.fixed_avatar_effect_help', 'Keep the post avatar sticky while reading long comments on desktop.'),
      }, 30);
  },
  -999999
);
