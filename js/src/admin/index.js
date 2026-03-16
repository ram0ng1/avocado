import UploadImageButton from 'flarum/common/components/UploadImageButton';

app.initializers.add(
  'ramon-avocado',
  (app) => {
    app.registry.for('ramon-avocado')
      // ── Banner upload ────────────────────────────────────────────────────────
      .registerSetting(() => (
        <div className="Form-group">
          <label>Banner Image</label>
          <UploadImageButton
            name="avocado-banner"
            routePath="avocado/banner"
            value={app.data.settings['avocado.hero_image']}
            url={
              app.data.settings['avocado.hero_image']
                ? app.forum.attribute('assetsBaseUrl') + '/' + app.data.settings['avocado.hero_image']
                : null
            }
          />
          <p className="helpText">Upload the hero banner image displayed at the top of the forum.</p>
        </div>
      ), 100)
      .registerSetting({
        setting: 'avocado.hero_image_position',
        type: 'text',
        label: 'Hero Image Position',
        help: "CSS background-position, e.g. 'center top' or 'center 20%'.",
      }, 90)
      // ── Other options ────────────────────────────────────────────────────────
      .registerSetting({
        setting: 'avocado.search_v1',
        type: 'boolean',
        label: 'Enable V1 search bar style',
        help: 'Show the inline search dropdown instead of the V2 modal.',
      }, 50)
      .registerSetting({
        setting: 'avocado.show_share',
        type: 'boolean',
        label: 'Show Share button on posts',
        help: 'Add a Share action button to each post.',
      }, 40)
      .registerSetting({
        setting: 'avocado.show_action_icons',
        type: 'boolean',
        label: 'Show icons on Like and Reply buttons',
        help: 'Display Font Awesome icons on the Like and Reply action buttons.',
      }, 30);
  },
  -999999
);
