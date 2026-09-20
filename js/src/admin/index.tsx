/*
 * Admin bootstrap.
 *
 * ORGANIZAÇÃO: a página era uma pilha de cards, um deles com dez assuntos
 * diferentes dentro ("Homepage": categorias, vitrine, títulos, banner, visitantes,
 * avatar…). Achar uma chave ali era rolar e ler — e cada recurso novo (o
 * Changelog, o ícone SVG) deixava a pilha mais comprida.
 *
 * Agora cada card trata de UM assunto e os cards moram em GRUPOS (abas):
 * Aparência · Página inicial · Discussões · Comunidade · Acesso. A aba escolhida
 * fica no localStorage, e o campo de busca no topo varre todos os grupos de uma
 * vez — é o atalho para quem já sabe o nome da configuração. Mesmo desenho do
 * admin do dfs.
 *
 * Os controles que salvam sozinhos vivem em ./components/* e os helpers em
 * ./util; aqui só ficam a definição dos cards (dados) e a casca que os desenha.
 * Card novo = uma entrada em CARDS, com o grupo a que pertence.
 */
import app from 'flarum/admin/app';
import UploadImageButton from 'flarum/common/components/UploadImageButton';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import { override } from 'flarum/common/extend';

import { trans, getBool, getStr, resolveAssetUrl } from './util';
import { AdminCard, SubDivider } from './components/AdminCard';
import AdminToggle from './components/AdminToggle';
import AdminSelect from './components/AdminSelect';
import AdminText from './components/AdminText';
import AdminTextarea from './components/AdminTextarea';
import SpinnerPicker from './components/SpinnerPicker';
import AdminTagPicker from './components/AdminTagPicker';
import AdminGroupPicker from './components/AdminGroupPicker';
import extendEditTagModal from './extendEditTagModal';
import { installTagIconSvg } from '../common/tagIconSvg';

// ─────────────────────────────────────────────────────────────────────────────
// Grupos
// ─────────────────────────────────────────────────────────────────────────────

type GroupKey = 'appearance' | 'home' | 'discussions' | 'community' | 'access';

const GROUPS: { key: GroupKey; icon: string; label: () => string }[] = [
  { key: 'appearance', icon: 'fas fa-palette', label: () => trans('ramon-avocado.admin.settings.group_appearance', 'Appearance') },
  { key: 'home', icon: 'fas fa-house', label: () => trans('ramon-avocado.admin.settings.group_home', 'Homepage') },
  { key: 'discussions', icon: 'far fa-comments', label: () => trans('ramon-avocado.admin.settings.group_discussions', 'Discussions') },
  { key: 'community', icon: 'fas fa-users', label: () => trans('ramon-avocado.admin.settings.group_community', 'Community') },
  { key: 'access', icon: 'fas fa-key', label: () => trans('ramon-avocado.admin.settings.group_access', 'Access') },
];

interface CardDef {
  group: GroupKey;
  icon: string;
  title: () => string;
  /** Palavras extras para a busca — o que o usuário digitaria procurando o card. */
  keywords: string;
  body: () => any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────────────────────

const CARDS: CardDef[] = [
  // ── Aparência ──────────────────────────────────────────────────────────────
  {
    group: 'appearance',
    icon: 'fas fa-image',
    title: () => trans('ramon-avocado.admin.settings.section_logo', 'Logo'),
    keywords: 'logo svg marca spinner carregamento loading avatar padrão default',
    body: () => (
      <>
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

        <SubDivider />
        <AdminToggle
          settingKey="avocado.custom_loading_spinner"
          label={trans('ramon-avocado.admin.settings.custom_loading_spinner_label', 'Custom loading spinner')}
          help={trans(
            'ramon-avocado.admin.settings.custom_loading_spinner_help',
            'Replace the default text loading indicator with an animated SVG spinner.'
          )}
        />
        {getBool('avocado.custom_loading_spinner') && <div className="AvocadoAdmin-subGroup">{m(SpinnerPicker)}</div>}

        <SubDivider />
        {/* Avatar padrão: é identidade visual, e não assunto da home — por isso
            mora aqui, junto do logo. */}
        <AdminToggle
          settingKey="avocado.custom_default_avatar"
          label={trans('ramon-avocado.admin.settings.custom_default_avatar_label', 'Use custom default avatar')}
          help={trans(
            'ramon-avocado.admin.settings.custom_default_avatar_help',
            'Show a person silhouette icon instead of the initial letter when no avatar is uploaded.'
          )}
        />
      </>
    ),
  },
  {
    group: 'appearance',
    icon: 'fas fa-palette',
    title: () => trans('ramon-avocado.admin.settings.section_colored', 'Colored'),
    keywords: 'cor cores colored borda border destaque accent categoria tag',
    body: () => (
      <>
        <AdminToggle
          settingKey="avocado.colored_enabled"
          label={trans('ramon-avocado.admin.settings.colored_enabled_label', 'Enable colored accents')}
          help={trans(
            'ramon-avocado.admin.settings.colored_enabled_help',
            'Apply the active tag or discussion color to primary buttons, links, and other UI accents across the forum.'
          )}
        />
        {getBool('avocado.colored_enabled') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminSelect
              settingKey="avocado.colored_border_style"
              label={trans('ramon-avocado.admin.settings.colored_border_style_label', 'Discussion card border style')}
              help={trans(
                'ramon-avocado.admin.settings.colored_border_style_help',
                'Add a colored border to discussion cards using the primary tag color.'
              )}
              options={{
                none: trans('ramon-avocado.admin.settings.colored_border_style_none', 'None'),
                left: trans('ramon-avocado.admin.settings.colored_border_style_left', 'Left border'),
                full: trans('ramon-avocado.admin.settings.colored_border_style_full', 'Full border'),
              }}
              default="none"
            />
          </div>
        )}
      </>
    ),
  },
  {
    // Absorvido da extensão `ramon/tag-icon-svg`. Com ela ativa o tema cede: o
    // switch fica inerte e o campo do modal é o dela.
    group: 'appearance',
    icon: 'fas fa-bezier-curve',
    title: () => trans('ramon-avocado.admin.settings.section_tag_icon_svg', 'Tag icons (SVG)'),
    keywords: 'svg ícone icone icon tag categoria font awesome vetor',
    body: () => (
      <>
        {!('flarum-tags' in flarum.extensions) && (
          <p className="helpText AvocadoAdmin-notice">
            {trans('ramon-avocado.admin.settings.tag_icon_svg_tags_notice', 'This needs the Tags extension, which is not enabled.')}
          </p>
        )}
        {'ramon-tag-icon-svg' in flarum.extensions && (
          <p className="helpText AvocadoAdmin-notice">
            {trans(
              'ramon-avocado.admin.settings.tag_icon_svg_standalone_notice',
              'The standalone Tag Icon SVG extension is enabled, so it keeps handling SVG icons and this switch does nothing. Disable that extension to let the theme take over — the icons you already saved are kept.'
            )}
          </p>
        )}
        <AdminToggle
          settingKey="avocado.tag_icon_svg_enabled"
          label={trans('ramon-avocado.admin.settings.tag_icon_svg_label', 'Allow SVG as a tag icon')}
          help={trans(
            'ramon-avocado.admin.settings.tag_icon_svg_help',
            'Adds an SVG field to the Edit tag modal. An SVG replaces the Font Awesome icon everywhere the tag icon is shown — including the changelog types. SVGs are sanitized on save. Reload the admin after turning it on.'
          )}
        />
      </>
    ),
  },

  // ── Página inicial ─────────────────────────────────────────────────────────
  {
    group: 'home',
    icon: 'fas fa-tags',
    title: () => trans('ramon-avocado.admin.settings.section_home_categories', 'Featured categories'),
    keywords: 'categorias categories destaque featured tags home página inicial',
    body: () => (
      <AdminTagPicker
        settingKey="avocado.featured_tags"
        label={trans('ramon-avocado.admin.settings.featured_tags_label', 'Featured Categories')}
        help={trans(
          'ramon-avocado.admin.settings.featured_tags_help',
          'Selected categories appear highlighted on the homepage and categories page.'
        )}
        placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select categories…')}
      />
    ),
  },
  {
    group: 'home',
    icon: 'fas fa-images',
    title: () => trans('ramon-avocado.admin.settings.section_showcase', 'Showcase / Portfolio'),
    keywords: 'showcase vitrine portfólio portfolio carrossel slider cards imagem image tags',
    body: () => {
      const showcaseSelected = !!getStr('avocado.showcase_tag');
      return (
        <>
          <AdminToggle
            settingKey="avocado.showcase_enabled"
            label={trans('ramon-avocado.admin.settings.showcase_enabled_label', 'Enable Showcase / Portfolio section')}
            help={trans(
              'ramon-avocado.admin.settings.showcase_enabled_help',
              'Show a showcase slider on the homepage with discussions from selected tags.'
            )}
          />

          {/* All showcase settings — only visible when enabled */}
          {getBool('avocado.showcase_enabled') && (
            <div className="AvocadoAdmin-subGroup">
              <AdminTagPicker
                settingKey="avocado.showcase_tag"
                label={trans('ramon-avocado.admin.settings.showcase_tag_label', 'Showcase / Portfolio Tags')}
                help={trans(
                  'ramon-avocado.admin.settings.showcase_tag_help',
                  'Discussions from these tags appear in the showcase slider on the homepage.'
                )}
                placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
              />
              {showcaseSelected && (
                <>
                  <AdminText
                    settingKey="avocado.showcase_heading"
                    label={trans('ramon-avocado.admin.settings.showcase_heading_label', 'Showcase Section Title')}
                    help={trans(
                      'ramon-avocado.admin.settings.showcase_heading_help',
                      'Custom title for the showcase section. Leave empty to use default.'
                    )}
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
                      default: trans('ramon-avocado.admin.settings.showcase_image_style_default', 'Default (Compact)'),
                      full: trans('ramon-avocado.admin.settings.showcase_image_style_full', 'Full Image'),
                    }}
                    default="default"
                  />
                </>
              )}
            </div>
          )}
        </>
      );
    },
  },
  {
    group: 'home',
    icon: 'fas fa-heading',
    title: () => trans('ramon-avocado.admin.settings.section_titles_heading', 'Section titles'),
    keywords: 'títulos titulos titles seções secoes sections popular following categorias heading',
    body: () => (
      <>
        <p className="helpText">
          {trans(
            'ramon-avocado.admin.settings.section_titles_help',
            'Override the homepage section titles. Leave any field empty to use the language pack default.'
          )}
        </p>
        <AdminText
          settingKey="avocado.categories_heading"
          label={trans('ramon-avocado.admin.settings.categories_heading_label', 'Categories Section Title')}
          placeholder={trans('ramon-avocado.forum.home.categories_heading', 'Categories')}
        />
        <AdminText
          settingKey="avocado.popular_heading"
          label={trans('ramon-avocado.admin.settings.popular_heading_label', 'Popular Discussions Title')}
          placeholder={trans('ramon-avocado.forum.home.popular_heading', 'Popular discussions')}
        />
        <AdminText
          settingKey="avocado.following_heading"
          label={trans('ramon-avocado.admin.settings.following_heading_label', 'Following Discussions Title')}
          placeholder={trans('ramon-avocado.forum.home.following_heading', 'Following')}
        />
      </>
    ),
  },
  {
    group: 'home',
    icon: 'fas fa-panorama',
    title: () => trans('ramon-avocado.admin.settings.section_home_banner', 'Banner'),
    keywords: 'banner hero imagem image html personalizado custom capa cabeçalho topo posição position',
    body: () => (
      <>
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
            help={trans(
              'ramon-avocado.admin.settings.hero_image_position_help',
              "CSS background-position value, e.g. 'center top' or 'center 20%'."
            )}
            placeholder="center top"
          />
        )}

        <SubDivider />

        {/* Custom hero HTML — replaces the inner content of the hero banner when enabled */}
        <AdminToggle
          settingKey="avocado.custom_hero_enabled"
          label={trans('ramon-avocado.admin.settings.custom_hero_enabled_label', 'Use custom hero content (HTML)')}
          help={trans(
            'ramon-avocado.admin.settings.custom_hero_enabled_help',
            'Replace the default hero content (icon, title, description, Login/Sign Up buttons) with your own HTML. The hero banner wrapper, background image and overlay stay intact. Shown to guests only — same as the default hero.'
          )}
        />
        {getBool('avocado.custom_hero_enabled') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminTextarea
              settingKey="avocado.custom_hero_html"
              label={trans('ramon-avocado.admin.settings.custom_hero_html_label', 'Custom hero HTML')}
              help={trans(
                'ramon-avocado.admin.settings.custom_hero_html_help',
                "HTML injected inside the hero banner overlay (replaces .AvocadoHome-heroBannerContent). Inline '<style>' tags are supported."
              )}
              placeholder={trans(
                'ramon-avocado.admin.settings.custom_hero_html_placeholder',
                '<div class="AvocadoHome-heroBannerContent">\n  <h1 class="AvocadoHome-heroBannerTitle">Welcome!</h1>\n  <p class="AvocadoHome-heroBannerDesc">Anything you want — links, images, buttons.</p>\n</div>'
              )}
              rows={10}
              className="AvocadoAdmin-codeField"
            />
          </div>
        )}
      </>
    ),
  },

  // ── Discussões ─────────────────────────────────────────────────────────────
  {
    group: 'discussions',
    icon: 'fas fa-comment-alt',
    title: () => trans('ramon-avocado.admin.settings.section_posts', 'Posts'),
    keywords: 'posts compartilhar share curtir like responder reply ícones avatar fixo sticky threads layout',
    body: () => (
      <>
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
          help={trans(
            'ramon-avocado.admin.settings.fixed_avatar_effect_help',
            'Keep the post avatar sticky while reading long comments on desktop.'
          )}
        />
        <AdminToggle
          settingKey="avocado.threads_style"
          label={trans('ramon-avocado.admin.settings.threads_style_label', 'Enable Threads-style discussion layout')}
          help={trans(
            'ramon-avocado.admin.settings.threads_style_help',
            'Display the OP post as a card and indent replies with a left border, like the Threads app.'
          )}
        />
      </>
    ),
  },
  {
    // Which treatment the discussion page draws. "Editorial" is the variant
    // ported from the dfs theme: a wider reading column plus a conversation
    // spine — a hairline threading down the avatar column that turns every
    // avatar into a node and every time gap into a labelled station. The header
    // is NOT touched; it stays the theme's own in both. Desktop only, so phone
    // and tablet keep today's page. The CSS is gated by an attribute written on
    // <html> before the first paint (Content\DiscussionStyle) so switching never
    // flashes the other style.
    group: 'discussions',
    icon: 'fas fa-comments',
    title: () => trans('ramon-avocado.admin.settings.section_discussion', 'Discussion page'),
    keywords: 'discussão discussion página page estilo style editorial spine badge grupo group posição position',
    body: () => (
      <>
        <AdminSelect
          settingKey="avocado.discussion_style"
          label={trans('ramon-avocado.admin.settings.disc_style_label', 'Discussion page style')}
          help={trans(
            'ramon-avocado.admin.settings.disc_style_help',
            'Default is today’s page. Editorial widens the reading column and threads the conversation with a hairline spine running down the avatar column, each avatar sitting on it as a node and each time gap becoming a labelled station. The header is the same in both. Desktop only — phones and tablets keep the current page either way.'
          )}
          options={{
            default: trans('ramon-avocado.admin.settings.disc_style_default', 'Default'),
            editorial: trans('ramon-avocado.admin.settings.disc_style_editorial', 'Editorial (conversation spine)'),
          }}
          default="default"
        />
        <AdminSelect
          settingKey="avocado.post_badge_position"
          label={trans('ramon-avocado.admin.settings.post_badge_position_label', 'Group badge position in posts')}
          help={trans(
            'ramon-avocado.admin.settings.post_badge_position_help',
            'Where a member’s group badges sit in a post. The first option turns the custom badge off: back to Flarum’s round badge overlapping the avatar. Every other option turns each badge into a capsule with the group name beside its icon. Works with the fixed avatar effect on or off. Phones always keep the compact overlay.'
          )}
          options={{
            default: trans('ramon-avocado.admin.settings.post_badge_position_default', 'Flarum default (off — disc over the avatar)'),
            inline: trans('ramon-avocado.admin.settings.post_badge_position_inline', 'Beside the username'),
            below: trans('ramon-avocado.admin.settings.post_badge_position_below', 'Below the username (own line)'),
            side: trans('ramon-avocado.admin.settings.post_badge_position_side', 'Under the avatar (left column)'),
            side_icons: trans('ramon-avocado.admin.settings.post_badge_position_side_icons', 'Under the avatar — icons only, side by side'),
          }}
          default="inline"
        />
      </>
    ),
  },
  {
    group: 'discussions',
    icon: 'fas fa-icons',
    title: () => trans('ramon-avocado.admin.settings.section_disc_hero_icon', 'Discussion header icon'),
    keywords: 'ícone icon decoração decoration cabeçalho header hero tag secundária opacidade opacity divisor divider',
    body: () => (
      <>
        <AdminToggle
          settingKey="avocado.hero_decoration_icon"
          label={trans('ramon-avocado.admin.settings.hero_decoration_icon_label', 'Show secondary tag icon on discussion hero')}
          help={trans(
            'ramon-avocado.admin.settings.hero_decoration_icon_help',
            'Display the secondary tag icon as a large decorative element on the right side of the discussion header.'
          )}
        />
        {getBool('avocado.hero_decoration_icon') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminSelect
              settingKey="avocado.hero_decoration_icon_count"
              label={trans('ramon-avocado.admin.settings.hero_decoration_icon_count_label', 'Number of decoration icons')}
              help={trans(
                'ramon-avocado.admin.settings.hero_decoration_icon_count_help',
                '1 icon uses the first child tag. 2 icons also shows the second child tag icon, offset to the left.'
              )}
              options={{
                '1': trans('ramon-avocado.admin.settings.hero_decoration_icon_count_one', '1 icon (first child tag)'),
                '2': trans('ramon-avocado.admin.settings.hero_decoration_icon_count_two', '2 icons (first and second child tag)'),
              }}
              default="1"
            />
            <AdminText
              settingKey="avocado.hero_decoration_icon_opacity"
              label={trans('ramon-avocado.admin.settings.hero_decoration_icon_opacity_label', 'Icon opacity (0–100)')}
              help={trans(
                'ramon-avocado.admin.settings.hero_decoration_icon_opacity_help',
                'Opacity of the decoration icon as a percentage. 100 = fully opaque.'
              )}
              placeholder="15"
            />
            {getStr('avocado.hero_decoration_icon_count', '1') === '2' && (
              <>
                <AdminToggle
                  settingKey="avocado.hero_deco_divider"
                  label={trans('ramon-avocado.admin.settings.hero_deco_divider_label', 'Show divider between decoration icons')}
                  help={trans(
                    'ramon-avocado.admin.settings.hero_deco_divider_help',
                    'Display an icon in the gap between the two decoration icons (e.g. a "vs" symbol for sport sites).'
                  )}
                />
                {getBool('avocado.hero_deco_divider') && (
                  <AdminText
                    settingKey="avocado.hero_deco_divider_icon"
                    label={trans('ramon-avocado.admin.settings.hero_deco_divider_icon_label', 'Divider icon class')}
                    help={trans(
                      'ramon-avocado.admin.settings.hero_deco_divider_icon_help',
                      'Font Awesome class for the divider icon, e.g. "fas fa-times" or "fas fa-circle".'
                    )}
                    placeholder="fas fa-times"
                  />
                )}
              </>
            )}
          </div>
        )}
      </>
    ),
  },
  {
    // Picks which tags trigger an "upload an image" prompt in the composer.
    // Each discussion stores its own image (column added by the migration), and
    // it's rendered as the discussion hero background + as the first showcase
    // image. The setting is a JSON array of tag IDs (same shape as featured_tags)
    // and is read on the forum side via `app.forum.attribute('avocadoHeroImageTags')`.
    group: 'discussions',
    icon: 'fas fa-image',
    title: () => trans('ramon-avocado.admin.settings.section_hero_image_tags', 'Hero image on discussions'),
    keywords: 'capa cover hero imagem image upload compositor composer tags discussão',
    body: () => (
      <AdminTagPicker
        settingKey="avocado.hero_image_tags"
        label={trans('ramon-avocado.admin.settings.hero_image_tags_label', 'Tags that ask for a hero image')}
        help={trans(
          'ramon-avocado.admin.settings.hero_image_tags_help',
          'When the user adds one of these tags to a new discussion, the composer reveals an optional image upload field. The uploaded image is shown as the discussion header background and as the first image in the homepage showcase.'
        )}
        placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
      />
    ),
  },
  {
    group: 'discussions',
    icon: 'fas fa-bookmark',
    title: () => trans('ramon-avocado.admin.settings.section_bookmarks', 'Bookmarks'),
    keywords: 'bookmarks salvos saved favoritos lembrete reminder nota note relógio clock horário 12 24',
    body: () => (
      <>
        {/* Com o fof/bookmarks ativo o tema cede o sistema inteiro para ele —
            o que está abaixo fica inerte até a extensão ser desativada. */}
        {'fof-bookmarks' in ((flarum as any)?.extensions ?? {}) && (
          <p className="helpText AvocadoAdmin-notice">
            {trans(
              'ramon-avocado.admin.settings.bookmarks_fof_notice',
              'FoF Bookmarks is enabled, so Avocado hands its own bookmark system over to it: the theme shows a single Saved menu item and a single save button, which writes to FoF Bookmarks. Notes and reminders are unavailable while it is on; your saved Avocado data is kept and comes back if you disable it.'
            )}
          </p>
        )}
        <AdminToggle
          settingKey="avocado.bookmarks_enabled"
          label={trans('ramon-avocado.admin.settings.bookmarks_enabled_label', 'Enable the bookmark system')}
          help={trans(
            'ramon-avocado.admin.settings.bookmarks_enabled_help',
            'Save button on cards, the Saved page, notes, reminders and reminder notifications. Turning this off hides everything and disables the API endpoints; saved data is kept.'
          )}
        />
        {getBool('avocado.bookmarks_enabled') && (
          <>
            <SubDivider />
            <AdminSelect
              settingKey="avocado.clock_format"
              default="auto"
              label={trans('ramon-avocado.admin.settings.clock_format_label', 'Time format')}
              help={trans(
                'ramon-avocado.admin.settings.clock_format_help',
                'Used by reminders: the hour picker in “Remind me” and the time shown on saved cards. Automatic follows each visitor’s browser.'
              )}
              options={{
                auto: trans('ramon-avocado.admin.settings.clock_format_auto', 'Automatic (visitor’s browser)'),
                '12': trans('ramon-avocado.admin.settings.clock_format_12', '12-hour (2:30 PM)'),
                '24': trans('ramon-avocado.admin.settings.clock_format_24', '24-hour (14:30)'),
              }}
            />
          </>
        )}
      </>
    ),
  },

  // ── Comunidade ─────────────────────────────────────────────────────────────
  {
    // Cada tag principal escolhida é um produto; cada discussão nela, uma versão.
    // As sub-tags do produto são os tipos (Adicionado, Corrigido, …) e vêm sem
    // configuração: nome, cor e ícone são os da própria tag.
    group: 'community',
    icon: 'fas fa-rocket',
    title: () => trans('ramon-avocado.admin.settings.section_changelog', 'Changelog'),
    keywords: 'changelog versões versoes releases lançamentos novidades produtos products atualizações notas release notes',
    body: () => (
      <>
        <AdminToggle
          settingKey="avocado.changelog_enabled"
          label={trans('ramon-avocado.admin.settings.changelog_enabled_label', 'Enable the Changelog page')}
          help={trans(
            'ramon-avocado.admin.settings.changelog_enabled_help',
            'Show a /changelog page that turns tags into products and their discussions into releases. Needs the Tags extension.'
          )}
        />
        {getBool('avocado.changelog_enabled') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminTagPicker
              settingKey="avocado.changelog_tags"
              label={trans('ramon-avocado.admin.settings.changelog_tags_label', 'Products')}
              help={trans(
                'ramon-avocado.admin.settings.changelog_tags_help',
                'Each tag selected here is a changelog of its own (Alega, Avocado, another extension…). Every discussion in it is a release, and the sub-tags of that tag are the change types — Added, Fixed, Removed, Security… — coloured and iconed by the tag itself. Who can publish is set by the tag permissions. Choosing a product here also asks for a cover image in the composer.'
              )}
              placeholder={trans('ramon-avocado.admin.settings.tag_picker_placeholder', 'Select tags…')}
            />
            <AdminText
              settingKey="avocado.changelog_title"
              label={trans('ramon-avocado.admin.settings.changelog_title_label', 'Page title')}
              placeholder={trans('ramon-avocado.admin.settings.changelog_title_placeholder', 'Changelog')}
            />
            <AdminText
              settingKey="avocado.changelog_description"
              label={trans('ramon-avocado.admin.settings.changelog_description_label', 'Page description')}
              placeholder={trans(
                'ramon-avocado.admin.settings.changelog_description_placeholder',
                "What's new, what's fixed and what's gone — release by release."
              )}
            />
            <p className="helpText">
              {trans(
                'ramon-avocado.admin.settings.changelog_version_help',
                'The version comes from the discussion title: start it with the number, like “v2.4.0 — New dashboard”. Titles without one are listed by date only.'
              )}
            </p>
          </div>
        )}
      </>
    ),
  },
  {
    group: 'community',
    icon: 'fas fa-users',
    title: () => trans('ramon-avocado.admin.settings.section_team', 'Team Page'),
    keywords: 'equipe team página page grupos groups membros members staff',
    body: () => (
      <>
        <AdminToggle
          settingKey="avocado.team_page_enabled"
          label={trans('ramon-avocado.admin.settings.team_enabled_label', 'Enable Team page')}
          help={trans('ramon-avocado.admin.settings.team_enabled_help', 'Show a /team page listing members of the selected groups.')}
        />
        {getBool('avocado.team_page_enabled') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminText
              settingKey="avocado.team_page_title"
              label={trans('ramon-avocado.admin.settings.team_title_label', 'Page title')}
              placeholder={trans('ramon-avocado.admin.settings.team_title_placeholder', 'Our Team')}
            />
            <AdminText
              settingKey="avocado.team_page_description"
              label={trans('ramon-avocado.admin.settings.team_desc_label', 'Page description')}
              placeholder={trans('ramon-avocado.admin.settings.team_desc_placeholder', 'Meet the people behind the community.')}
            />
            {m(AdminGroupPicker, {
              settingKey: 'avocado.team_page_groups',
              label: trans('ramon-avocado.admin.settings.team_groups_label', 'Groups to display'),
              help: trans('ramon-avocado.admin.settings.team_groups_help', 'Members of the selected groups will appear on the Team page.'),
            })}
          </div>
        )}
      </>
    ),
  },
  {
    group: 'community',
    icon: 'fas fa-user-clock',
    title: () => trans('ramon-avocado.admin.settings.section_online', 'Online users'),
    keywords: 'online usuários users contagem count avatares home',
    body: () => (
      <>
        <AdminToggle
          settingKey="avocado.show_online_users"
          label={trans('ramon-avocado.admin.settings.show_online_users_label', 'Show Online Users section')}
          help={trans(
            'ramon-avocado.admin.settings.show_online_users_help',
            'Display currently online users between Categories and Popular Discussions.'
          )}
        />
        <AdminToggle
          settingKey="avocado.show_online_count"
          label={trans('ramon-avocado.admin.settings.show_online_count_label', 'Show online count text')}
          help={trans('ramon-avocado.admin.settings.show_online_count_help', 'Show the "X online" label next to the online user avatars.')}
        />
      </>
    ),
  },
  {
    group: 'community',
    icon: 'fas fa-broadcast-tower',
    title: () => trans('ramon-avocado.admin.settings.section_presence', 'Presence'),
    keywords: 'presença presence lendo reading realtime tempo real leitores',
    body: () => (
      <AdminToggle
        settingKey="avocado.presence_enabled"
        label={trans('ramon-avocado.admin.settings.presence_enabled_label', "Show who's reading a discussion")}
        help={trans(
          'ramon-avocado.admin.settings.presence_enabled_help',
          'Live "N reading now" indicator in the discussion hero, with reader avatars. Requires the Realtime extension; users with "disclose online" off are never listed.'
        )}
      />
    ),
  },
  {
    group: 'community',
    icon: 'far fa-id-card',
    title: () => trans('ramon-avocado.admin.settings.section_user_card', 'User Card'),
    keywords: 'cartão card usuário user perfil profile hover bio',
    body: () => (
      <AdminToggle
        settingKey="avocado.user_card_enabled"
        label={trans('ramon-avocado.admin.settings.user_card_enabled_label', 'Enable the user hover card')}
        help={trans(
          'ramon-avocado.admin.settings.user_card_enabled_help',
          'Show a Discourse-style mini profile (bio, badges, stats, actions) when hovering avatars and usernames.'
        )}
      />
    ),
  },
  {
    group: 'community',
    icon: 'fas fa-birthday-cake',
    title: () => trans('ramon-avocado.admin.settings.section_cakeday', 'Cakeday'),
    keywords: 'cakeday aniversário anniversary bolo cake conta account',
    body: () => (
      <AdminToggle
        settingKey="avocado.cakeday_enabled"
        label={trans('ramon-avocado.admin.settings.cakeday_enabled_label', 'Show account anniversary badge')}
        help={trans(
          'ramon-avocado.admin.settings.cakeday_enabled_help',
          'Show a 🎂 next to the username on the anniversary of the account registration (thread cards, posts and user card).'
        )}
      />
    ),
  },

  // ── Acesso ─────────────────────────────────────────────────────────────────
  {
    group: 'access',
    icon: 'fas fa-key',
    title: () => trans('ramon-avocado.admin.settings.section_auth', 'Login & Registration'),
    keywords: 'login cadastro registro registration modal entrar imagem image autenticação auth',
    body: () => (
      <>
        <AdminToggle
          settingKey="avocado.custom_auth_modal"
          label={trans('ramon-avocado.admin.settings.custom_auth_modal_label', 'Use custom login / sign up modal')}
          help={trans(
            'ramon-avocado.admin.settings.custom_auth_modal_help',
            "Show the custom side-panel design on the Log In, Sign Up and Forgot Password modals. Turn off to use Flarum's default modal."
          )}
        />
        {getBool('avocado.custom_auth_modal') && (
          <div className="AvocadoAdmin-subGroup">
            <div className="Form-group">
              <label className="AvocadoAdmin-label">{trans('ramon-avocado.admin.settings.auth_image_label', 'Auth Modal Image')}</label>
              <UploadImageButton
                name="avocado-auth"
                routePath="avocado/auth-image"
                value={app.data.settings['avocado.auth_image']}
                url={resolveAssetUrl(app.data.settings['avocado.auth_image'])}
              />
              <p className="helpText">
                {trans(
                  'ramon-avocado.admin.settings.auth_image_help',
                  'Background image shown in the right panel of login, sign up, and forgot password modals.'
                )}
              </p>
            </div>
          </div>
        )}
      </>
    ),
  },
  {
    // O que só o visitante (guest) enxerga ou sofre: chamadas para entrar, botões
    // no cabeçalho, links bloqueados. Estavam espalhados entre a home e os posts.
    group: 'access',
    icon: 'fas fa-user-slash',
    title: () => trans('ramon-avocado.admin.settings.section_guests', 'Guests'),
    keywords: 'visitantes guests convidados cta entrar login cadastro sign up botões buttons links bloquear hide post',
    body: () => (
      <>
        <AdminToggle
          settingKey="avocado.show_guest_cta"
          label={trans('ramon-avocado.admin.settings.show_guest_cta_label', 'Show Login / Sign Up buttons in hero banner')}
          help={trans(
            'ramon-avocado.admin.settings.show_guest_cta_help',
            'Display call-to-action buttons inside the homepage hero banner for guests.'
          )}
        />
        <AdminToggle
          settingKey="avocado.show_auth_buttons"
          label={trans('ramon-avocado.admin.settings.show_auth_buttons_label', 'Show Login / Sign Up buttons in header for guests')}
          help={trans('ramon-avocado.admin.settings.show_auth_buttons_help', 'Display Log In and Sign Up pill buttons in the header for guests.')}
        />
        <AdminToggle
          settingKey="avocado.hide_links_for_guests"
          label={trans('ramon-avocado.admin.settings.hide_links_for_guests_label', 'Hide links for guests')}
          help={trans(
            'ramon-avocado.admin.settings.hide_links_for_guests_help',
            'Prevent guests from following links in posts. Clicking shows a Login / Sign Up prompt instead.'
          )}
        />

        <SubDivider />

        {/* Guest post CTA */}
        <AdminToggle
          settingKey="avocado.show_post_cta"
          label={trans('ramon-avocado.admin.settings.show_post_cta_label', 'Show Join CTA after first post for guests')}
          help={trans(
            'ramon-avocado.admin.settings.show_post_cta_help',
            'Display a Log In / Sign Up card after the first post, visible only to guests.'
          )}
        />
        {getBool('avocado.show_post_cta') && (
          <div className="AvocadoAdmin-subGroup">
            <AdminSelect
              settingKey="avocado.post_cta_position"
              label={trans('ramon-avocado.admin.settings.post_cta_position_label', 'CTA position (after which post number)')}
              help={trans(
                'ramon-avocado.admin.settings.post_cta_position_help',
                'Insert the CTA banner between this post number and the next one.'
              )}
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
      </>
    ),
  },
  {
    group: 'access',
    icon: 'fas fa-search',
    title: () => trans('ramon-avocado.admin.settings.section_search', 'Search'),
    keywords: 'busca search barra bar v1 v2 modal',
    body: () => (
      <AdminToggle
        settingKey="avocado.search_v1"
        label={trans('ramon-avocado.admin.settings.search_v1_label', 'Enable V1 search bar style')}
        help={trans('ramon-avocado.admin.settings.search_v1_help', 'Show the inline search dropdown instead of the V2 modal.')}
      />
    ),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Casca: abas + busca
// ─────────────────────────────────────────────────────────────────────────────

const TAB_STORAGE_KEY = 'avocado.admin.tab';

/** Aba ativa, lembrada entre visitas — mexer numa configuração recarrega a view
 *  inteira, e voltar sempre para a primeira aba seria perder o lugar. */
let activeGroup: GroupKey = (() => {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY) as GroupKey | null;
    if (saved && GROUPS.some((g) => g.key === saved)) return saved;
  } catch {
    /* localStorage bloqueado — segue no padrão */
  }
  return 'appearance';
})();

let query = '';

const setGroup = (key: GroupKey) => {
  activeGroup = key;
  query = '';
  try {
    localStorage.setItem(TAB_STORAGE_KEY, key);
  } catch {
    /* sem persistência é só uma conveniência a menos */
  }
};

const matchesQuery = (card: CardDef, q: string): boolean => `${card.title()} ${card.keywords}`.toLowerCase().includes(q);

const AvocadoSettingsPanel: any = {
  view() {
    const q = query.trim().toLowerCase();
    // Buscando, os grupos saem da frente: o resultado vem de todos eles.
    const visible = q ? CARDS.filter((c) => matchesQuery(c, q)) : CARDS.filter((c) => c.group === activeGroup);

    return (
      <div className="AvocadoAdmin-settings">
        <div className="AvocadoAdmin-toolbar">
          <nav className="AvocadoAdmin-tabs" role="tablist" aria-label={trans('ramon-avocado.admin.settings.groups_aria', 'Settings groups')}>
            {GROUPS.map((g) => {
              const count = CARDS.filter((c) => c.group === g.key).length;
              const isActive = !q && g.key === activeGroup;
              return (
                <button
                  key={g.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`AvocadoAdmin-tab${isActive ? ' is-active' : ''}`}
                  onclick={() => setGroup(g.key)}
                >
                  <i className={g.icon} aria-hidden="true" />
                  <span>{g.label()}</span>
                  <span className="AvocadoAdmin-tabCount">{count}</span>
                </button>
              );
            })}
          </nav>

          <div className="AvocadoAdmin-search">
            <i className="fas fa-search" aria-hidden="true" />
            <input
              type="search"
              className="AvocadoAdmin-searchInput"
              value={query}
              placeholder={trans('ramon-avocado.admin.settings.search_placeholder', 'Search settings…')}
              oninput={(e: any) => {
                query = e.target.value;
              }}
            />
            {!!query && (
              <button
                type="button"
                className="AvocadoAdmin-searchClear"
                aria-label={trans('ramon-avocado.admin.settings.search_clear', 'Clear search')}
                onclick={() => {
                  query = '';
                }}
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="AvocadoAdmin-empty">{trans('ramon-avocado.admin.settings.search_empty', 'No settings found.')}</p>
        ) : (
          visible.map((card) => (
            <AdminCard key={card.title()} title={card.title()} icon={card.icon}>
              {card.body()}
            </AdminCard>
          ))
        )}
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registro
// ─────────────────────────────────────────────────────────────────────────────

// All settings use auto-saving components — the native Save button is unnecessary
// and confusing, so suppress it for this extension page only.
override(ExtensionPage.prototype, 'submitButton', function (original) {
  if (this.extension?.id === 'ramon-avocado') return null;
  return original();
});

app.initializers.add('ramon-avocado', (app) => {
  // Ícone SVG nas tags: o campo no modal "Editar tag" e os overrides só agem com
  // o switch ligado; o flarum/tags é opcional para o tema, então sem ele não há
  // modal nem Tag para estender.
  if ('flarum-tags' in flarum.extensions) {
    installTagIconSvg();
    extendEditTagModal();
  }

  // Um único item no registro: a casca desenha as abas e os cards do grupo
  // ativo. Registrar card a card devolveria a pilha de antes.
  app.registry.for('ramon-avocado').registerSetting(() => m(AvocadoSettingsPanel), 100);
});
