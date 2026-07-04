<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado;

use Flarum\Api\Endpoint;
use Flarum\Extend;
use Ramon\Avocado\AvocadoServiceProvider;
use Ramon\Avocado\Middleware\AddPerfHeaders;
use Ramon\Avocado\Support\HtmlSanitizer;

return [
    (new Extend\ServiceProvider())
        ->register(AvocadoServiceProvider::class),

    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->jsDirectory(__DIR__.'/js/dist/forum')
        ->css(__DIR__.'/less/forum.less')
        ->content(\Ramon\Avocado\Content\AddCriticalCss::class)
        ->content(\Ramon\Avocado\Content\AddCriticalPreloads::class)
        ->content(\Ramon\Avocado\Content\AddHeroBannerPreload::class)
        ->content(\Ramon\Avocado\Content\CustomLoadingSpinner::class)
        ->content(\Ramon\Avocado\Content\HideLogoFlash::class)
        // No CSS-deferral injector here: Flarum core already emits async CSS
        // natively (warm-visit cache + <link rel="preload" onload>); a custom
        // deferral only duplicated <noscript>/<link> tags.
        ->content(\Ramon\Avocado\Content\LoadFontAwesomeKit::class)
        ->content(\Ramon\Avocado\Content\InjectOnlineUsers::class)
        ->route('/discussions', 'avocado-discussions')
        ->route('/search', 'avocado-search')
        ->route('/bookmarks', 'avocado-bookmarks'),

    (new Extend\Routes('forum'))
        ->get('/team', 'avocado-team', \Ramon\Avocado\Controller\TeamPageController::class),

    (new Extend\Middleware('forum'))
        ->add(AddPerfHeaders::class),

    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js')
        ->css(__DIR__.'/less/admin.less'),

    new Extend\Locales(__DIR__.'/locale'),

    // ── flarum/realtime: NOT NEEDED - flarum/messages already handles it ────────────

    // ── flarum/realtime + flarum/likes ───────────────────────────────────────
    (new Extend\Conditional())
        ->whenExtensionEnabled('flarum-realtime', fn () => [
            (new Extend\Conditional())
                ->whenExtensionEnabled('flarum-likes', fn () => [
                    (new \Flarum\Realtime\Extend\Realtime())
                        ->broadcastModelEvent(
                            [
                                \Flarum\Likes\Event\PostWasLiked::class,
                                \Flarum\Likes\Event\PostWasUnliked::class,
                            ],
                            fn ($event) => $event->post,
                            fn ($event) => $event->user,
                            'likesMutation',
                        ),
                ]),
        ]),

    // ── flarum/realtime + flarum/sticky ──────────────────────────────────────
    (new Extend\Conditional())
        ->whenExtensionEnabled('flarum-realtime', fn () => [
            (new Extend\Conditional())
                ->whenExtensionEnabled('flarum-sticky', fn () => [
                    (new \Flarum\Realtime\Extend\Realtime())
                        ->broadcastModelEvent(
                            [
                                \Flarum\Sticky\Event\DiscussionWasStickied::class,
                                \Flarum\Sticky\Event\DiscussionWasUnstickied::class,
                            ],
                            fn ($event) => $event->discussion,
                            fn ($event) => $event->actor,
                            'discussionPinned',
                        ),
                ]),
        ]),

    // ── flarum/realtime — post removal/restoration (delete + hide) ───────────
    // Both events share one channel name (postRemoved): clients always need to
    // refresh the discussion to reflect the new visible state, so a single
    // event handler is enough.
    (new Extend\Conditional())
        ->whenExtensionEnabled('flarum-realtime', fn () => [
            (new \Flarum\Realtime\Extend\Realtime())
                ->broadcastModelEvent(
                    [
                        \Flarum\Post\Event\Deleted::class,
                        \Flarum\Post\Event\Hidden::class,
                        \Flarum\Post\Event\Restored::class,
                    ],
                    fn ($event) => $event->post,
                    fn ($event) => $event->actor,
                    'postRemoved',
                ),
        ]),

    (new Extend\ApiResource(\Flarum\Api\Resource\ForumResource::class))
        ->fields(\Ramon\Avocado\Api\ForumAttributes::class),

    (new Extend\Model(\Flarum\Discussion\Discussion::class))
        ->hasOne('avocadoHero', \Ramon\Avocado\Model\DiscussionHero::class, 'discussion_id')
        ->hasMany('avocadoBookmark', \Ramon\Avocado\Model\Bookmark::class, 'discussion_id'),

    (new Extend\ApiResource(\Flarum\Api\Resource\DiscussionResource::class))
        ->fields(\Ramon\Avocado\Api\DiscussionFields::class)
        ->fields(\Ramon\Avocado\Api\BookmarkFields::class)
        // Eager-load the 1:1 hero companion so DiscussionFields' getters don't
        // fire one SELECT per discussion when serializing an Index payload.
        // avocadoBookmark is scoped to the actor so `bookmarked` reads an
        // in-memory (0|1)-row collection instead of one SELECT per discussion.
        ->endpoint(
            [Endpoint\Index::class, Endpoint\Show::class],
            fn (Endpoint\Index|Endpoint\Show $endpoint) => $endpoint
                ->eagerLoad('avocadoHero')
                ->eagerLoadWhere('avocadoBookmark', function ($query, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    $query->where('user_id', $actor->isGuest() ? 0 : (int) $actor->id);
                })
        ),

    (new Extend\Routes('api'))
        ->post('/avocado/banner', 'avocado.banner.upload', \Ramon\Avocado\Controller\UploadBannerController::class)
        ->delete('/avocado/banner', 'avocado.banner.delete', \Ramon\Avocado\Controller\DeleteBannerController::class)
        ->post('/avocado/auth-image', 'avocado.auth_image.upload', \Ramon\Avocado\Controller\UploadAuthImageController::class)
        ->delete('/avocado/auth-image', 'avocado.auth_image.delete', \Ramon\Avocado\Controller\DeleteAuthImageController::class)
        ->post('/avocado/logo-svg', 'avocado.logo_svg.upload', \Ramon\Avocado\Controller\UploadLogoSvgController::class)
        ->delete('/avocado/logo-svg', 'avocado.logo_svg.delete', \Ramon\Avocado\Controller\DeleteLogoSvgController::class)
        ->post('/avocado/discussion-hero', 'avocado.discussion_hero.upload', \Ramon\Avocado\Controller\UploadDiscussionHeroController::class)
        ->delete('/avocado/discussion-hero', 'avocado.discussion_hero.delete', \Ramon\Avocado\Controller\DeleteDiscussionHeroController::class)
        ->post('/avocado/bookmark', 'avocado.bookmark.create', \Ramon\Avocado\Controller\CreateBookmarkController::class)
        ->delete('/avocado/bookmark', 'avocado.bookmark.delete', \Ramon\Avocado\Controller\DeleteBookmarkController::class),

    (new Extend\Settings())
        ->serializeToForum('avocadoHeroImage', 'avocado.hero_image')
        ->serializeToForum('avocadoHeroImagePosition', 'avocado.hero_image_position')
        ->serializeToForum('avocadoAuthImage', 'avocado.auth_image')
        ->serializeToForum('avocadoCustomAuthModal', 'avocado.custom_auth_modal', 'boolval')
        ->serializeToForum('avocadoShowOnlineUsers', 'avocado.show_online_users', 'boolval')
        ->serializeToForum('avocadoShowOnlineCount', 'avocado.show_online_count', 'boolval')
        ->serializeToForum('avocadoShowAuthButtons', 'avocado.show_auth_buttons', 'boolval')
        ->serializeToForum('avocadoSearchV1', 'avocado.search_v1', 'boolval')
        ->serializeToForum('avocadoShowShare', 'avocado.show_share', 'boolval')
        ->serializeToForum('avocadoShowActionIcons', 'avocado.show_action_icons', 'boolval')
        ->serializeToForum('avocadoFixedAvatarEffect', 'avocado.fixed_avatar_effect', 'boolval')
        ->serializeToForum('avocadoHeroDecorationIcon', 'avocado.hero_decoration_icon', 'boolval')
        ->serializeToForum('avocadoHeroDecorationIconCount', 'avocado.hero_decoration_icon_count')
        ->serializeToForum('avocadoHeroDecorationIconOpacity', 'avocado.hero_decoration_icon_opacity')
        ->serializeToForum('avocadoHeroDecoDivider', 'avocado.hero_deco_divider', 'boolval')
        ->serializeToForum('avocadoHeroDecoDividerIcon', 'avocado.hero_deco_divider_icon')
        ->serializeToForum('avocadoFeaturedTags', 'avocado.featured_tags')
        ->serializeToForum('avocadoHeroImageTags', 'avocado.hero_image_tags')
        ->serializeToForum('avocadoLogoSvg', 'avocado.logo_svg')
        ->serializeToForum('avocadoLogoEnabled', 'avocado.logo_enabled', 'boolval')
        ->serializeToForum('avocadoCustomDefaultAvatar', 'avocado.custom_default_avatar', 'boolval')
        ->serializeToForum('avocadoShowGuestCta', 'avocado.show_guest_cta', 'boolval')
        ->serializeToForum('avocadoShowPostCta', 'avocado.show_post_cta', 'boolval')
        ->serializeToForum('avocadoPostCtaPosition', 'avocado.post_cta_position')
        ->serializeToForum('avocadoHideLinksForGuests', 'avocado.hide_links_for_guests', 'boolval')
        ->serializeToForum('avocadoShowcaseEnabled', 'avocado.showcase_enabled', 'boolval')
        ->serializeToForum('avocadoShowcaseTag', 'avocado.showcase_tag')
        ->serializeToForum('avocadoShowcaseHeading', 'avocado.showcase_heading')
        ->serializeToForum('avocadoShowcaseCount', 'avocado.showcase_count')
        ->serializeToForum('avocadoShowcaseImageStyle', 'avocado.showcase_image_style')
        ->serializeToForum('avocadoCategoriesHeading',  'avocado.categories_heading')
        ->serializeToForum('avocadoPopularHeading',     'avocado.popular_heading')
        ->serializeToForum('avocadoFollowingHeading',   'avocado.following_heading')
        ->serializeToForum('avocadoCustomHeroEnabled',  'avocado.custom_hero_enabled', 'boolval')
        ->serializeToForum('avocadoCustomHeroHtml',     'avocado.custom_hero_html', fn ($html) => HtmlSanitizer::sanitize((string) $html))
        ->serializeToForum('avocadoColoredEnabled', 'avocado.colored_enabled', 'boolval')
        ->serializeToForum('avocadoColoredBorderStyle', 'avocado.colored_border_style', null, 'none')
        ->serializeToForum('avocadoThreadsStyle', 'avocado.threads_style', 'boolval')
        ->serializeToForum('avocadoCustomLoadingSpinner', 'avocado.custom_loading_spinner', 'boolval')
        ->serializeToForum('avocadoTeamPageEnabled', 'avocado.team_page_enabled', 'boolval')
        ->serializeToForum('avocadoTeamPageGroups', 'avocado.team_page_groups')
        ->serializeToForum('avocadoTeamPageTitle', 'avocado.team_page_title')
        ->serializeToForum('avocadoTeamPageDescription', 'avocado.team_page_description')
        ->default('avocado.hero_image_position', 'center top')
        ->default('avocado.show_online_users', true)
        ->default('avocado.show_auth_buttons', false)
        ->default('avocado.custom_auth_modal', true)
        ->default('avocado.search_v1', true)
        ->default('avocado.show_share', true)
        ->default('avocado.show_action_icons', true)
        ->default('avocado.fixed_avatar_effect', true)
        ->default('avocado.hero_decoration_icon', false)
        ->default('avocado.hero_decoration_icon_opacity', '15')
        ->default('avocado.featured_tags', '[]')
        ->default('avocado.hero_image_tags', '[]')
        ->default('avocado.logo_enabled', false)
        ->default('avocado.custom_default_avatar', true)
        ->default('avocado.show_guest_cta', true)
        ->default('avocado.show_post_cta', false)
        ->default('avocado.post_cta_position', '1')
        ->default('avocado.hide_links_for_guests', false)
        ->default('avocado.showcase_tag', '')
        ->default('avocado.showcase_heading', '')
        ->default('avocado.showcase_count', '5')
        ->default('avocado.showcase_image_style', 'default')
        ->default('avocado.categories_heading', '')
        ->default('avocado.popular_heading', '')
        ->default('avocado.following_heading', '')
        ->default('avocado.custom_hero_enabled', false)
        ->default('avocado.custom_hero_html', '')
        ->default('avocado.colored_enabled', false)
        ->default('avocado.colored_border_style', 'none')
        ->default('avocado.threads_style', false)
        ->default('avocado.custom_loading_spinner', false)
        ->default('avocado.loading_spinner_style', 'avocado')
        ->default('avocado.loading_spinner_custom', '')
        ->default('avocado.team_page_enabled', false)
        ->default('avocado.team_page_groups', '[]')
        ->default('avocado.team_page_title', '')
        ->default('avocado.team_page_description', '')
        ->default('avocado.fontawesome_kit_enabled', false),

    (new Extend\SearchDriver(\Flarum\Search\Database\DatabaseSearchDriver::class))
        ->addFilter(\Flarum\Discussion\Search\DiscussionSearcher::class, \Ramon\Avocado\Filter\BookmarkFilter::class),

    (new Extend\Policy())
        ->modelPolicy(\Flarum\Discussion\Discussion::class, \Ramon\Avocado\Access\DiscussionPolicy::class),
];
