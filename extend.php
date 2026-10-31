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
use Ramon\Avocado\Support\BookmarksSchema;
use Ramon\Avocado\Support\ChangelogSchema;
use Ramon\Avocado\Support\SanitizedHtmlCache;
use Ramon\Avocado\Support\SupportEvents;
use Ramon\Avocado\Support\TagIconSvg;
use Ramon\Avocado\Support\WikiStyleSchema;
use s9e\TextFormatter\Configurator;

// id da extensão => folha em less/forum/, na ordem da cascata (ver o uso abaixo).
$extensionStylesheets = [
    'flarum-messages' => 'MessagesPage.less',
    'huseyinfiliz-leaderboard' => 'extensions/LeaderboardPage.less',
    'fof-gamification' => 'extensions/Gamification.less',
    'linkrobins-badge-labels' => 'extensions/BadgeLabels.less',
    BookmarksRoute::CONFLICTING_EXTENSION_ID => 'extensions/FofBookmarks.less',
    'flectar-fancybox' => 'extensions/Fancybox.less',
    'datlechin-mermaid' => 'extensions/Mermaid.less',
    'linkrobins-support' => 'extensions/Support.less',
    'linkrobins-wiki' => 'extensions/Wiki.less',
];

// Com o ernestdefoe/wardrobe os ->content() de todos os temas rodam em toda página;
// sem este portão o CSS/JS inline do Avocado vazaria para o outro tema (e esconderia
// o logo dele). Sem o Wardrobe, não faz nada.
$onlyForAvocado = static fn (string $class): \Closure => static function (\Flarum\Frontend\Document $document, \Psr\Http\Message\ServerRequestInterface $request) use ($class): void {
    if (class_exists(\Ernestdefoe\Wardrobe\ThemeRegistry::class)
        && resolve(\Flarum\Extension\ExtensionManager::class)->isEnabled('ernestdefoe-wardrobe')) {
        $cookie = $request->getCookieParams()['wardrobe_theme'] ?? null;
        $active = resolve(\Ernestdefoe\Wardrobe\ThemeRegistry::class)->resolve(
            \Flarum\Http\RequestUtil::getActor($request),
            is_string($cookie) ? $cookie : null
        );

        if ($active !== null && $active !== 'ramon-avocado') {
            return;
        }
    }

    resolve($class)($document, $request);
};

return [
    (new Extend\ServiceProvider())
        ->register(AvocadoServiceProvider::class),

    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->jsDirectory(__DIR__.'/js/dist/forum')
        ->css(__DIR__.'/less/forum.less')
        ->content($onlyForAvocado(\Ramon\Avocado\Content\AddCriticalCss::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\AddCriticalPreloads::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\AddHeroBannerPreload::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\CustomLoadingSpinner::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\HideLogoFlash::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\LinkIconStyle::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\DiscussionStyle::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\SearchStyle::class))
        // Sem adiamento de CSS próprio: o core já carrega o CSS de forma assíncrona,
        // e um segundo mecanismo só duplicaria as tags <noscript>/<link>.
        ->content($onlyForAvocado(\Ramon\Avocado\Content\LoadFontAwesomeKit::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\InjectOnlineUsers::class))
        // Preloads de dado — cada um sai cedo se não estiver na sua rota.
        ->content($onlyForAvocado(\Ramon\Avocado\Content\PreloadTeamMembers::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\PreloadShowcase::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\PreloadHomeFeed::class))
        ->content($onlyForAvocado(\Ramon\Avocado\Content\PreloadChangelog::class))
        ->route('/discussions', 'avocado-discussions'),

    // O ramon/canela também registra GET /search; com os dois ligados (Wardrobe)
    // duas rotas iguais derrubariam o boot (FastRoute\BadRouteException).
    (new Extend\Conditional())
        ->whenExtensionDisabled('ramon-canela', fn () => [
            (new Extend\Frontend('forum'))->route('/search', 'avocado-search'),
        ]),

    // Cada folha só entra no forum.css com a extensão ativa. O Flarum compila as folhas
    // de css() num único Less_Parser, na ordem de registro: por isso ficam entre o
    // forum.less e o forum-tail.less e enxergam as variáveis do common sem importar nada.
    ...array_map(
        fn (string $extensionId, string $sheet) => (new Extend\Conditional())
            ->whenExtensionEnabled($extensionId, fn () => [
                (new Extend\Frontend('forum'))->css(__DIR__.'/less/forum/'.$sheet),
            ]),
        array_keys($extensionStylesheets),
        $extensionStylesheets,
    ),

    (new Extend\Frontend('forum'))
        ->css(__DIR__.'/less/forum-tail.less'),

    // Tabelas GFM no Markdown, que o Litedown do flarum/markdown não tem e o wiki
    // precisa. O formatter é um só, então vale para posts novos também; os já
    // salvos guardam o XML deles e não mudam.
    // Design de cada artigo do linkrobins/wiki (tabela companheira 1:1). Sem a tabela
    // migrada os endpoints seguem sem o eager-load e todo artigo fica no padrão.
    (new Extend\Conditional())
        ->whenExtensionEnabled('linkrobins-wiki', fn () => [
            (new Extend\Model(WikiStyleSchema::ARTICLE_MODEL))
                ->hasOne('avocadoStyle', \Ramon\Avocado\Model\WikiArticleStyle::class, 'article_id'),

            (new Extend\ApiResource(WikiStyleSchema::ARTICLE_RESOURCE))
                ->fields(\Ramon\Avocado\Api\WikiArticleFields::class)
                ->endpoint(
                    [Endpoint\Index::class, Endpoint\Show::class],
                    fn (Endpoint\Index|Endpoint\Show $endpoint) => resolve(WikiStyleSchema::class)->available()
                        ? $endpoint->eagerLoad('avocadoStyle')
                        : $endpoint
                ),
        ]),

    (new Extend\Conditional())
        ->whenExtensionEnabled('flarum-markdown', fn () => [
            (new Extend\Conditional())
                ->whenExtensionEnabled('linkrobins-wiki', fn () => [
                    (new Extend\Formatter())
                        ->configure(function (Configurator $config): void {
                            $config->plugins->load('PipeTables');
                        }),
                ]),
        ]),

    // A página "Salvos" só existe quando o fof/bookmarks não está ativo: duas
    // rotas GET no mesmo `/bookmarks` derrubam o boot do Flarum inteiro
    // (FastRoute\BadRouteException). Ver Support\BookmarksRoute.
    (new Extend\Conditional())
        ->whenExtensionDisabled(BookmarksRoute::CONFLICTING_EXTENSION_ID, fn () => [
            (new Extend\Frontend('forum'))
                ->route(BookmarksRoute::PATH, BookmarksRoute::ROUTE_NAME),
        ]),

    (new Extend\Routes('forum'))
        ->get('/team', 'avocado-team', \Ramon\Avocado\Controller\TeamPageController::class)
        // Dois nomes para o mesmo controller: o front monta as URLs por nome
        // (app.route), e /changelog/:product leva o slug da tag do produto.
        ->get('/changelog', 'avocado-changelog', \Ramon\Avocado\Controller\ChangelogPageController::class)
        ->get('/changelog/{product}', 'avocado-changelog.product', \Ramon\Avocado\Controller\ChangelogPageController::class),

    (new Extend\Middleware('forum'))
        ->add(AddPerfHeaders::class)
        // /t/produto e /t/subtag do changelog → 302 para /changelog/... (só age com o
        // flarum/tags e o changelog ligados; ver Middleware\RedirectChangelogTags).
        ->add(\Ramon\Avocado\Middleware\RedirectChangelogTags::class),

    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js')
        ->css(__DIR__.'/less/admin.less'),

    new Extend\Locales(__DIR__.'/locale'),

    // Mensagens privadas não precisam de broadcast aqui: o flarum/messages já faz isso.

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

    // ── flarum/realtime — post apagado, ocultado ou restaurado ───────────────
    // Um só evento (postRemoved): em todos os casos o cliente só recarrega a discussão.
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
        ->hasOne('avocadoChangelog', \Ramon\Avocado\Model\ChangelogEntry::class, 'discussion_id')
        ->hasMany('avocadoBookmark', \Ramon\Avocado\Model\Bookmark::class, 'discussion_id'),

    (new Extend\ApiResource(\Flarum\Api\Resource\DiscussionResource::class))
        ->fields(\Ramon\Avocado\Api\DiscussionFields::class)
        // Sem o eager-load, cada discussão do Index dispararia um SELECT no hero.
        ->endpoint(
            [Endpoint\Index::class, Endpoint\Show::class],
            fn (Endpoint\Index|Endpoint\Show $endpoint) => $endpoint->eagerLoad('avocadoHero')
        ),

    // Curtidas do primeiro post na discussão: o card não precisa de `include=firstPost`
    // (render do post inteiro) nem de um GET extra depois do boot.
    (new Extend\Conditional())
        ->whenExtensionEnabled('flarum-likes', fn () => [
            (new Extend\ApiResource(\Flarum\Api\Resource\DiscussionResource::class))
                ->fields(\Ramon\Avocado\Api\DiscussionLikeFields::class),
        ]),

    // Versão e capa do changelog. Sem a tabela migrada o endpoint segue sem o
    // eager-load em vez de derrubar toda listagem de discussões.
    (new Extend\ApiResource(\Flarum\Api\Resource\DiscussionResource::class))
        ->fields(\Ramon\Avocado\Api\ChangelogFields::class)
        ->endpoint(
            [Endpoint\Index::class, Endpoint\Show::class],
            fn (Endpoint\Index|Endpoint\Show $endpoint) => resolve(ChangelogSchema::class)->available()
                ? $endpoint->eagerLoad('avocadoChangelog')
                : $endpoint
        ),

    // Com o fof/bookmarks ativo o tema cede: nem campos nem eager-load do bookmark.
    // O eager-load é escopado ao ator, então o campo lê 0 ou 1 linha já em memória.
    (new Extend\Conditional())
        ->whenExtensionDisabled(BookmarksRoute::CONFLICTING_EXTENSION_ID, fn () => [
            (new Extend\ApiResource(\Flarum\Api\Resource\DiscussionResource::class))
                ->fields(\Ramon\Avocado\Api\BookmarkFields::class)
                ->endpoint(
                    [Endpoint\Index::class, Endpoint\Show::class],
                    // Sem a tabela migrada (composer já atualizou, migrate não rodou) o
                    // eager-load sai em vez de derrubar a listagem. Guests não têm bookmark.
                    fn (Endpoint\Index|Endpoint\Show $endpoint) => resolve(BookmarksSchema::class)->available()
                        ? $endpoint->eagerLoadWhere('avocadoBookmark', function ($query, \Flarum\Api\Context $context) {
                            $actor = $context->getActor();
                            $query->where('user_id', $actor->isGuest() ? 0 : (int) $actor->id);
                        })
                        : $endpoint
                ),
        ]),

    (new Extend\Routes('api'))
        ->post('/avocado/banner', 'avocado.banner.upload', \Ramon\Avocado\Controller\UploadBannerController::class)
        ->delete('/avocado/banner', 'avocado.banner.delete', \Ramon\Avocado\Controller\DeleteBannerController::class)
        ->post('/avocado/auth-image', 'avocado.auth_image.upload', \Ramon\Avocado\Controller\UploadAuthImageController::class)
        ->delete('/avocado/auth-image', 'avocado.auth_image.delete', \Ramon\Avocado\Controller\DeleteAuthImageController::class)
        ->post('/avocado/logo-svg', 'avocado.logo_svg.upload', \Ramon\Avocado\Controller\UploadLogoSvgController::class)
        ->delete('/avocado/logo-svg', 'avocado.logo_svg.delete', \Ramon\Avocado\Controller\DeleteLogoSvgController::class)
        ->post('/avocado/link-icon-svg', 'avocado.link_icon_svg.upload', \Ramon\Avocado\Controller\UploadLinkIconSvgController::class)
        ->delete('/avocado/link-icon-svg', 'avocado.link_icon_svg.delete', \Ramon\Avocado\Controller\DeleteLinkIconSvgController::class)
        ->post('/avocado/discussion-hero', 'avocado.discussion_hero.upload', \Ramon\Avocado\Controller\UploadDiscussionHeroController::class)
        ->delete('/avocado/discussion-hero', 'avocado.discussion_hero.delete', \Ramon\Avocado\Controller\DeleteDiscussionHeroController::class)
        ->post('/avocado/bookmark', 'avocado.bookmark.create', \Ramon\Avocado\Controller\CreateBookmarkController::class)
        ->patch('/avocado/bookmark', 'avocado.bookmark.update', \Ramon\Avocado\Controller\UpdateBookmarkController::class)
        ->delete('/avocado/bookmark', 'avocado.bookmark.delete', \Ramon\Avocado\Controller\DeleteBookmarkController::class),

    // Ícone SVG nas tags. Com a extensão avulsa `ramon/tag-icon-svg` ativa o tema
    // cede: as duas registrariam os mesmos campos e sobrescreveriam `Icon` duas vezes.
    (new Extend\Conditional())
        ->whenExtensionEnabled(TagIconSvg::TAGS_EXTENSION_ID, fn () => [
            (new Extend\Conditional())
                ->whenExtensionDisabled(TagIconSvg::STANDALONE_EXTENSION_ID, fn () => [
                    (new Extend\Model(\Flarum\Tags\Tag::class))
                        ->cast('icon_svg_mono', 'bool')
                        ->cast('icon_svg_scale', 'int'),

                    (new Extend\ApiResource(\Flarum\Tags\Api\Resource\TagResource::class))
                        ->fields(\Ramon\Avocado\Api\TagIconSvgFields::class),

                    (new Extend\Settings())
                        ->serializeToForum('avocadoTagIconSvg', TagIconSvg::SETTING, fn ($value) => resolve(TagIconSvg::class)->enabledFor($value)),

                    // Extend\Settings à parte de propósito: `serializeToForum` indexa pela chave do
                    // setting, e um segundo attribute na mesma instância apagaria o de cima.
                    (new Extend\Settings())
                        ->serializeToForum('avocadoTagIconSvgScale', TagIconSvg::SETTING, fn ($value) => resolve(TagIconSvg::class)->enabledFor($value) && resolve(TagIconSvg::class)->scaleAvailable()),
                ]),
        ]),

    // As versões do changelog não contam como discussão: nem no total do autor,
    // nem no da tag (Api\ChangelogCounts). Só o que sai no JSON muda.
    (new Extend\ApiResource(\Flarum\Api\Resource\UserResource::class))
        ->field('discussionCount', fn ($field) => resolve(\Ramon\Avocado\Api\ChangelogCounts::class)->forUsers($field)),

    // As contagens acima ficam no cache entre requests; qualquer escrita que
    // possa mudar "quais discussões são versão" invalida. Os nomes de evento do
    // flarum/tags são só strings aqui: com a extensão desligada nunca disparam.
    (new Extend\Event())
        ->listen(\Flarum\Discussion\Event\Started::class, \Ramon\Avocado\Listener\FlushChangelogCounts::class)
        ->listen(\Flarum\Discussion\Event\Deleted::class, \Ramon\Avocado\Listener\FlushChangelogCounts::class)
        ->listen(\Flarum\Discussion\Event\Deleting::class, \Ramon\Avocado\Listener\DeleteDiscussionHeroFile::class)
        ->listen(\Flarum\Discussion\Event\Hidden::class, \Ramon\Avocado\Listener\FlushChangelogCounts::class)
        ->listen(\Flarum\Discussion\Event\Restored::class, \Ramon\Avocado\Listener\FlushChangelogCounts::class)
        ->listen('Flarum\Tags\Event\DiscussionWasTagged', \Ramon\Avocado\Listener\FlushChangelogCounts::class)
        // Evento do Eloquent, não o `Deleting` do flarum/tags: dispara depois do
        // DELETE (e do cascade em discussion_tag), sem janela para um request
        // concorrente regravar o cache com o valor antigo.
        ->listen('eloquent.deleted: Flarum\Tags\Tag', \Ramon\Avocado\Listener\FlushChangelogCounts::class)
        // Fontes e fire.webp são copiados junto com a recompilação de assets do core,
        // para o boot de cada request não pagar a cópia (Support\BundledAssets).
        ->listen(\Flarum\Foundation\Event\ClearingCache::class, \Ramon\Avocado\Listener\SyncBundledAssets::class)
        ->listen(\Flarum\Extension\Event\Enabled::class, \Ramon\Avocado\Listener\SyncBundledAssets::class),

    (new Extend\Conditional())
        ->whenExtensionEnabled(TagIconSvg::TAGS_EXTENSION_ID, fn () => [
            // As tags de cada discussão passam pela TagPolicy do flarum/tags, que
            // olha a tag mãe de cada filha — sem eager-load, uma consulta por tag
            // filha (45 na home). Carregar `tags.parent` junto vira uma consulta.
            (new Extend\ApiResource(\Flarum\Api\Resource\DiscussionResource::class))
                ->endpoint(
                    [Endpoint\Index::class, Endpoint\Show::class],
                    fn (Endpoint\Index|Endpoint\Show $endpoint) => $endpoint->eagerLoad('tags.parent')
                ),

            (new Extend\ApiResource(\Flarum\Tags\Api\Resource\TagResource::class))
                ->field('discussionCount', fn ($field) => resolve(\Ramon\Avocado\Api\ChangelogCounts::class)->forTags($field)),
        ]),

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
        // 'default' ou 'editorial'. Vai para o forum porque o skeleton precisa saber qual
        // desenhar; o CSS é ligado pelo atributo que o Content\DiscussionStyle põe no <html>.
        ->default('avocado.discussion_style', 'default')
        ->serializeToForum('avocadoDiscussionStyle', 'avocado.discussion_style')
        // Pílula "Escreva uma resposta…" fixa na base da tela em toda a discussão
        // (js/src/forum/utils/composerDock.ts). Desligada, compositor e placeholder do fim voltam ao core.
        ->default('avocado.reply_dock_enabled', true)
        ->serializeToForum('avocadoReplyDockEnabled', 'avocado.reply_dock_enabled', 'boolval')
        // Prévia dentro do compositor do core: botão de prévia e tela dividida em
        // tela cheia; a prévia no fim da discussão sai (js/src/forum/utils/composerPreview.ts).
        ->default('avocado.composer_preview', true)
        ->serializeToForum('avocadoComposerPreview', 'avocado.composer_preview', 'boolval')
        // Tela cheia do compositor do core com a metamorfose do compositor da home
        // (js/src/forum/utils/composerMorph.ts).
        ->default('avocado.composer_morph', true)
        ->serializeToForum('avocadoComposerMorph', 'avocado.composer_morph', 'boolval')
        // Compositor de nova discussão da home: 'default' (no lugar do campo), 'inline'
        // (no lugar do campo, com a metamorfose) ou 'floating' (cartão na base da tela).
        ->default('avocado.new_discussion_composer', 'inline')
        ->serializeToForum('avocadoNewDiscussionComposer', 'avocado.new_discussion_composer')
        // "↳ Em resposta a" no topo de um post que abre com menção a outro post
        // (js/src/forum/utils/replyTo.ts). Desligado, a menção fica no texto.
        ->default('avocado.reply_to_header', true)
        ->serializeToForum('avocadoReplyToHeader', 'avocado.reply_to_header', 'boolval')
        // Posição dos badges de grupo no post; 'default' mantém o disco do core sobre
        // o avatar. O front converte o valor nas classes .avocado-badges--* do <html>.
        ->default('avocado.post_badge_position', 'inline')
        ->serializeToForum('avocadoPostBadgePosition', 'avocado.post_badge_position')
        ->serializeToForum('avocadoHeroDecorationIcon', 'avocado.hero_decoration_icon', 'boolval')
        ->serializeToForum('avocadoHeroDecorationIconCount', 'avocado.hero_decoration_icon_count')
        ->serializeToForum('avocadoHeroDecorationIconOpacity', 'avocado.hero_decoration_icon_opacity')
        ->serializeToForum('avocadoHeroDecoDivider', 'avocado.hero_deco_divider', 'boolval')
        ->serializeToForum('avocadoHeroDecoDividerIcon', 'avocado.hero_deco_divider_icon')
        ->serializeToForum('avocadoFeaturedTags', 'avocado.featured_tags')
        ->serializeToForum('avocadoHeroImageTags', 'avocado.hero_image_tags')
        // Rodapé do tema (js/src/forum/components/AvocadoFooter.tsx). Desligado
        // por padrão: quem já usa o "rodapé personalizado" do Flarum segue com ele.
        ->serializeToForum('avocadoFooterEnabled', 'avocado.footer_enabled', 'boolval')
        ->serializeToForum('avocadoFooterText', 'avocado.footer_text')
        ->serializeToForum('avocadoFooterEmail', 'avocado.footer_email')
        ->serializeToForum('avocadoFooterPhone', 'avocado.footer_phone')
        ->serializeToForum('avocadoFooterAddress', 'avocado.footer_address')
        ->serializeToForum('avocadoFooterLinks', 'avocado.footer_links')
        ->serializeToForum('avocadoFooterLegalLinks', 'avocado.footer_legal_links')
        ->serializeToForum('avocadoFooterSocial', 'avocado.footer_social')
        ->serializeToForum('avocadoFooterCopyright', 'avocado.footer_copyright')
        ->serializeToForum('avocadoLogoSvg', 'avocado.logo_svg')
        ->serializeToForum('avocadoLogoEnabled', 'avocado.logo_enabled', 'boolval')
        ->serializeToForum('avocadoCustomDefaultAvatar', 'avocado.custom_default_avatar', 'boolval')
        ->serializeToForum('avocadoShowGuestCta', 'avocado.show_guest_cta', 'boolval')
        ->serializeToForum('avocadoShowPostCta', 'avocado.show_post_cta', 'boolval')
        ->serializeToForum('avocadoPostCtaPosition', 'avocado.post_cta_position')
        // Texto do aviso; vazio = a frase padrão da tradução.
        ->serializeToForum('avocadoPostCtaText', 'avocado.post_cta_text')
        ->serializeToForum('avocadoHideLinksForGuests', 'avocado.hide_links_for_guests', 'boolval')
        ->serializeToForum('avocadoShowcaseEnabled', 'avocado.showcase_enabled', 'boolval')
        ->serializeToForum('avocadoShowcaseTag', 'avocado.showcase_tag')
        ->serializeToForum('avocadoShowcaseHeading', 'avocado.showcase_heading')
        ->serializeToForum('avocadoShowcaseCount', 'avocado.showcase_count')
        ->serializeToForum('avocadoShowcaseImageStyle', 'avocado.showcase_image_style')
        ->serializeToForum('avocadoCategoriesHeading',  'avocado.categories_heading')
        ->serializeToForum('avocadoPopularHeading',     'avocado.popular_heading')
        ->serializeToForum('avocadoFollowingHeading',   'avocado.following_heading')
        // Lista da home: ordem (popular | latest) e quantidade (5 a 20).
        ->serializeToForum('avocadoHomeFeedSort', 'avocado.home_feed_sort')
        ->serializeToForum('avocadoHomeFeedCount', 'avocado.home_feed_count', fn ($n) => max(1, min(20, (int) $n ?: 5)))
        ->serializeToForum('avocadoCustomHeroEnabled',  'avocado.custom_hero_enabled', 'boolval')
        // Sanitizado com cache por hash (Support\SanitizedHtmlCache): o payload do
        // fórum sai em toda página e o HTML só muda quando o admin salva.
        ->serializeToForum('avocadoCustomHeroHtml',     'avocado.custom_hero_html', fn ($html) => resolve(SanitizedHtmlCache::class)->sanitize('custom_hero_html', (string) $html))
        ->serializeToForum('avocadoColoredEnabled', 'avocado.colored_enabled', 'boolval')
        ->serializeToForum('avocadoColoredBorderStyle', 'avocado.colored_border_style')
        ->serializeToForum('avocadoThreadsStyle', 'avocado.threads_style', 'boolval')
        ->serializeToForum('avocadoCustomLoadingSpinner', 'avocado.custom_loading_spinner', 'boolval')
        // O botão de salvar segue o mesmo veredito do backend (BookmarksSetting):
        // sem a tabela migrada o forum recebe `false` e o front nem desenha o
        // botão, em vez de oferecer uma ação que o controller vai recusar.
        ->serializeToForum(
            'avocadoBookmarksEnabled',
            'avocado.bookmarks_enabled',
            fn ($value) => (bool) filter_var($value ?? true, FILTER_VALIDATE_BOOL) && resolve(BookmarksSchema::class)->available()
        )
        // Formato de hora nos horários que o tema desenha: 'auto' segue o locale do
        // navegador de cada visitante; '12'/'24' forçam o formato para o fórum todo.
        ->serializeToForum('avocadoClockFormat', 'avocado.clock_format')
        ->serializeToForum('avocadoUserCardEnabled', 'avocado.user_card_enabled', 'boolval')
        ->serializeToForum('avocadoPresenceEnabled', 'avocado.presence_enabled', 'boolval')
        ->serializeToForum('avocadoCakedayEnabled', 'avocado.cakeday_enabled', 'boolval')
        ->serializeToForum('avocadoTeamPageEnabled', 'avocado.team_page_enabled', 'boolval')
        ->serializeToForum('avocadoTeamPageGroups', 'avocado.team_page_groups')
        ->serializeToForum('avocadoTeamPageTitle', 'avocado.team_page_title')
        ->serializeToForum('avocadoTeamPageDescription', 'avocado.team_page_description')
        // Changelog: cada tag em `changelog_tags` é um produto; cada discussão nela,
        // uma versão. O título/descrição só personalizam o cabeçalho da página.
        ->serializeToForum('avocadoChangelogEnabled', 'avocado.changelog_enabled', 'boolval')
        ->serializeToForum('avocadoChangelogTags', 'avocado.changelog_tags')
        ->serializeToForum('avocadoChangelogTitle', 'avocado.changelog_title')
        ->serializeToForum('avocadoChangelogDescription', 'avocado.changelog_description')
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
        // Logo SVG na cor do fórum e ajuste vertical no cabeçalho: lidos só no
        // servidor (Content\HideLogoFlash), que os aplica antes do primeiro paint.
        ->default('avocado.logo_colored', false)
        ->default('avocado.logo_offset_y', '0')
        ->default('avocado.footer_enabled', false)
        // Texto, copyright e as listas do rodapé NÃO têm default aqui de propósito:
        // nunca gravados, valem o padrão do tema (js/src/common/footerContent.ts);
        // gravados vazios, somem. Um default '' apagaria essa diferença.
        ->default('avocado.footer_email', '')
        ->default('avocado.footer_phone', '')
        ->default('avocado.footer_address', '')
        ->default('avocado.custom_default_avatar', true)
        ->default('avocado.show_guest_cta', true)
        ->default('avocado.show_post_cta', false)
        ->default('avocado.post_cta_position', '1')
        ->default('avocado.post_cta_text', '')
        ->default('avocado.hide_links_for_guests', false)
        ->default('avocado.showcase_tag', '')
        ->default('avocado.showcase_heading', '')
        ->default('avocado.showcase_count', '5')
        ->default('avocado.showcase_image_style', 'default')
        ->default('avocado.categories_heading', '')
        ->default('avocado.popular_heading', '')
        ->default('avocado.following_heading', '')
        ->default('avocado.home_feed_sort', 'popular')
        ->default('avocado.home_feed_count', '5')
        ->default('avocado.custom_hero_enabled', false)
        ->default('avocado.custom_hero_html', '')
        ->default('avocado.colored_enabled', false)
        ->default('avocado.colored_border_style', 'none')
        ->default('avocado.threads_style', false)
        ->default('avocado.custom_loading_spinner', false)
        ->default('avocado.font_family', \Ramon\Avocado\Content\ThemeFonts::DM_SANS)
        ->default('avocado.font_custom_family', '')
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
        ->default('avocado.changelog_enabled', false)
        ->default('avocado.changelog_tags', '[]')
        ->default('avocado.changelog_title', '')
        ->default('avocado.changelog_description', '')
        ->default(TagIconSvg::SETTING, false)
        ->default('avocado.fontawesome_kit_enabled', false),

    (new Extend\SearchDriver(\Flarum\Search\Database\DatabaseSearchDriver::class))
        ->addFilter(\Flarum\Discussion\Search\DiscussionSearcher::class, \Ramon\Avocado\Filter\BookmarkFilter::class)
        // As versões do changelog moram na página dela, não nas listas de discussão
        // (ver Search\HideChangelogFromDiscussionLists para o que continua listando).
        ->addMutator(\Flarum\Discussion\Search\DiscussionSearcher::class, \Ramon\Avocado\Search\HideChangelogFromDiscussionLists::class),

    (new Extend\Policy())
        ->modelPolicy(\Flarum\Discussion\Discussion::class, \Ramon\Avocado\Access\DiscussionPolicy::class),

    // Linha do tempo de status dos tickets do linkrobins/support. Tudo dentro do
    // Conditional: com a extensão desligada o extender resolveria no boot uma classe
    // que não existe e estouraria.
    (new Extend\Conditional())
        ->whenExtensionEnabled(SupportEvents::EXTENSION_ID, fn () => [
            (new Extend\ServiceProvider())
                ->register(SupportEventsServiceProvider::class),

            (new Extend\Middleware('api'))
                ->add(\Ramon\Avocado\Middleware\RememberActor::class),

            (new Extend\Model(SupportEvents::TICKET_MODEL))
                ->hasMany('avocadoEvents', \Ramon\Avocado\Model\SupportEvent::class, 'ticket_id'),

            (new Extend\ApiResource(SupportEvents::TICKET_RESOURCE))
                ->fields(\Ramon\Avocado\Api\SupportEventFields::class)
                ->endpoint(
                    [Endpoint\Index::class, Endpoint\Show::class],
                    fn (Endpoint\Index|Endpoint\Show $endpoint) => resolve(SupportEvents::class)->available()
                        ? $endpoint->eagerLoad(['avocadoEvents', 'avocadoEvents.user'])
                        : $endpoint
                ),
        ]),
];
