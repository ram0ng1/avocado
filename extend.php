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

use Flarum\Extend;
use Flarum\Messages\DialogMessage;
use Ramon\Avocado\Middleware\RemoveSkipLink;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->css(__DIR__.'/less/forum.less')
        ->content(\Ramon\Avocado\Content\AddHeroBannerPreload::class)
        ->content(\Ramon\Avocado\Content\HideLogoFlash::class)
        ->route('/discussions', 'avocado-discussions')
        ->route('/search', 'avocado-search'),

    (new Extend\Middleware('forum'))
        ->add(RemoveSkipLink::class),

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

    (new Extend\ApiResource(\Flarum\Api\Resource\ForumResource::class))
        ->fields(\Ramon\Avocado\Api\ForumAttributes::class),

    (new Extend\Routes('api'))
        ->post('/avocado/banner', 'avocado.banner.upload', \Ramon\Avocado\Controller\UploadBannerController::class)
        ->delete('/avocado/banner', 'avocado.banner.delete', \Ramon\Avocado\Controller\DeleteBannerController::class)
        ->post('/avocado/auth-image', 'avocado.auth_image.upload', \Ramon\Avocado\Controller\UploadAuthImageController::class)
        ->delete('/avocado/auth-image', 'avocado.auth_image.delete', \Ramon\Avocado\Controller\DeleteAuthImageController::class)
        ->post('/avocado/logo-svg', 'avocado.logo_svg.upload', \Ramon\Avocado\Controller\UploadLogoSvgController::class)
        ->delete('/avocado/logo-svg', 'avocado.logo_svg.delete', \Ramon\Avocado\Controller\DeleteLogoSvgController::class),

    (new Extend\Settings())
        ->serializeToForum('avocadoHeroImage', 'avocado.hero_image')
        ->serializeToForum('avocadoHeroImagePosition', 'avocado.hero_image_position')
        ->serializeToForum('avocadoAuthImage', 'avocado.auth_image')
        ->serializeToForum('avocadoShowOnlineUsers', 'avocado.show_online_users', 'boolval')
        ->serializeToForum('avocadoShowAuthButtons', 'avocado.show_auth_buttons', 'boolval')
        ->serializeToForum('avocadoSearchV1', 'avocado.search_v1', 'boolval')
        ->serializeToForum('avocadoShowShare', 'avocado.show_share', 'boolval')
        ->serializeToForum('avocadoShowActionIcons', 'avocado.show_action_icons', 'boolval')
        ->serializeToForum('avocadoFixedAvatarEffect', 'avocado.fixed_avatar_effect', 'boolval')
        ->serializeToForum('avocadoFeaturedTags', 'avocado.featured_tags')
        ->serializeToForum('avocadoLogoSvg', 'avocado.logo_svg')
        ->serializeToForum('avocadoLogoEnabled', 'avocado.logo_enabled', 'boolval')
        ->serializeToForum('avocadoCustomDefaultAvatar', 'avocado.custom_default_avatar', 'boolval')
        ->serializeToForum('avocadoShowGuestCta', 'avocado.show_guest_cta', 'boolval')
        ->serializeToForum('avocadoShowPostCta', 'avocado.show_post_cta', 'boolval')
        ->serializeToForum('avocadoPostCtaPosition', 'avocado.post_cta_position')
        ->serializeToForum('avocadoHideLinksForGuests', 'avocado.hide_links_for_guests', 'boolval')
        ->default('avocado.hero_image_position', 'center top')
        ->default('avocado.show_online_users', true)
        ->default('avocado.show_auth_buttons', false)
        ->default('avocado.search_v1', true)
        ->default('avocado.show_share', true)
        ->default('avocado.show_action_icons', true)
        ->default('avocado.fixed_avatar_effect', true)
        ->default('avocado.featured_tags', '[]')
        ->default('avocado.logo_enabled', false)
        ->default('avocado.custom_default_avatar', true)
        ->default('avocado.show_guest_cta', true)
        ->default('avocado.show_post_cta', false)
        ->default('avocado.post_cta_position', '1')
        ->default('avocado.hide_links_for_guests', false),
];
