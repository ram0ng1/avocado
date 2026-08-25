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
use Ramon\Avocado\Support\BookmarksRoute;
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
        ->content(\Ramon\Avocado\Content\DiscussionStyle::class)
        ->content(\Ramon\Avocado\Content\SearchStyle::class)
        // No CSS-deferral injector here: Flarum core already emits async CSS
        // natively (warm-visit cache + <link rel="preload" onload>); a custom
        // deferral only duplicated <noscript>/<link> tags.
        ->content(\Ramon\Avocado\Content\LoadFontAwesomeKit::class)
        ->content(\Ramon\Avocado\Content\InjectOnlineUsers::class)
        // Preloads de dado — cada um sai cedo se não estiver na sua rota.
        ->content(\Ramon\Avocado\Content\PreloadTeamMembers::class)
        ->route('/discussions', 'avocado-discussions')
        ->route('/search', 'avocado-search'),

    // A página "Salvos" só existe quando o fof/bookmarks não está ativo: duas
    // rotas GET no mesmo `/bookmarks` derrubam o boot do Flarum inteiro
    // (FastRoute\BadRouteException). Ver Support\BookmarksRoute.
    (new Extend\Conditional())
        ->whenExtensionDisabled(BookmarksRoute::CONFLICTING_EXTENSION_ID, fn () => [
            (new Extend\Frontend('forum'))
                ->route(BookmarksRoute::PATH, BookmarksRoute::ROUTE_NAME),
        ]),

    (new Extend\Routes('forum'))
        ->get('/team', 'avocado-team', \Ramon\Avocado\Controller\TeamPageController::class),

    (new Extend\Middleware('forum'))
        ->add(AddPerfHeaders::class),

    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js')
        ->css(__DIR__.'/less/admin.less'),

    new Extend\Locales(__DIR__.'/locale'),

    // ── flarum/realtime: NOT NEEDED - flarum/messages already handles it ────────────

    // ── flarum/realtime — presence "quem está lendo" ─────────────────────────
    // A rota de auth só existe com o realtime ativo: o controller injeta o
    // singleton Pusher que o WebsocketProvider dele registra.
    (new Extend\Conditional())
        ->whenExtensionEnabled('flarum-realtime', fn () => [
            (new Extend\Routes('api'))
                ->post('/avocado/presence/auth', 'avocado.presence.auth', \Ramon\Avocado\Controller\PresenceAuthController::class),
        ]),

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
        // Eager-load the 1:1 hero companion so DiscussionFields' getters don't
        // fire one SELECT per discussion when serializing an Index payload.
        ->endpoint(
            [Endpoint\Index::class, Endpoint\Show::class],
            fn (Endpoint\Index|Endpoint\Show $endpoint) => $endpoint->eagerLoad('avocadoHero')
        ),

    // Bookmarks do tema: campos e eager-load só existem quando o fof/bookmarks
    // não está no comando. Cedendo, o tema para de serializar `avocadoBookmarked`
    // e de carregar a relação por discussão — sem consulta morta em cada Index.
    // avocadoBookmark é escopado ao ator, então o campo lê uma coleção de (0|1)
    // linhas já em memória em vez de um SELECT por discussão.
    (new Extend\Conditional())
        ->whenExtensionDisabled(BookmarksRoute::CONFLICTING_EXTENSION_ID, fn () => [
            (new Extend\ApiResource(\Flarum\Api\Resource\DiscussionResource::class))
                ->fields(\Ramon\Avocado\Api\BookmarkFields::class)
                ->endpoint(
                    [Endpoint\Index::class, Endpoint\Show::class],
                    fn (Endpoint\Index|Endpoint\Show $endpoint) => $endpoint
                        ->eagerLoadWhere('avocadoBookmark', function ($query, \Flarum\Api\Context $context) {
                            $actor = $context->getActor();
                            $query->where('user_id', $actor->isGuest() ? 0 : (int) $actor->id);
                        })
                ),
        ]),

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
        ->patch('/avocado/bookmark', 'avocado.bookmark.update', \Ramon\Avocado\Controller\UpdateBookmarkController::class)
        ->delete('/avocado/bookmark', 'avocado.bookmark.delete', \Ramon\Avocado\Controller\DeleteBookmarkController::class),

    (new Extend\Notification())
        ->type(\Ramon\Avocado\Notification\BookmarkReminderBlueprint::class, ['alert']),

    (new Extend\Console())
        ->command(\Ramon\Avocado\Console\SendBookmarkRemindersCommand::class)
        ->schedule(
            \Ramon\Avocado\Console\SendBookmarkRemindersCommand::class,
            \Ramon\Avocado\Console\BookmarkReminderSchedule::class
        ),

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
        // 'default' = a página de discussão de sempre (hero alto com wash na cor
        // da tag, fio sem linha). 'editorial' = a variante portada do dfs: hero
        // plano + a corrente que costura a conversa pela coluna do avatar.
        // Serializado para o forum porque o skeleton precisa saber qual desenhar;
        // o CSS em si é ligado pelo atributo em <html> que o
        // Content\DiscussionStyle escreve antes do primeiro paint.
        ->default('avocado.discussion_style', 'default')
        ->serializeToForum('avocadoDiscussionStyle', 'avocado.discussion_style')
        // Onde os badges de grupo aparecem no post: 'default' (camada desligada —
        // disco do core sobre o avatar), 'inline' (ao lado do nome), 'below'
        // (linha própria), 'side' (embaixo do avatar) ou 'side_icons' (embaixo do
        // avatar, só ícones). O forum bundle converte isso nas classes
        // .avocado-badges--* em <html>; ver forum/PostBadges.less.
        ->default('avocado.post_badge_position', 'inline')
        ->serializeToForum('avocadoPostBadgePosition', 'avocado.post_badge_position')
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
        ->serializeToForum('avocadoBookmarksEnabled', 'avocado.bookmarks_enabled', 'boolval')
        // Relógio de 12h (2:30 PM) ou 24h (14:30) nos horários que o tema
        // desenha — hoje o seletor de lembrete e o horário no card salvo.
        // 'auto' segue o locale do navegador de cada visitante, que é o que o
        // input nativo fazia; '12'/'24' forçam o formato para o fórum todo.
        ->serializeToForum('avocadoClockFormat', 'avocado.clock_format')
        ->serializeToForum('avocadoUserCardEnabled', 'avocado.user_card_enabled', 'boolval')
        ->serializeToForum('avocadoPresenceEnabled', 'avocado.presence_enabled', 'boolval')
        ->serializeToForum('avocadoCakedayEnabled', 'avocado.cakeday_enabled', 'boolval')
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
        ->default('avocado.bookmarks_enabled', true)
        ->default('avocado.clock_format', 'auto')
        ->default('avocado.user_card_enabled', true)
        ->default('avocado.presence_enabled', true)
        ->default('avocado.cakeday_enabled', true)
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
