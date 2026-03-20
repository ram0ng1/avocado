<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2024 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado;

use Flarum\Extend;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->css(__DIR__.'/less/forum.less')
        ->content(\Ramon\Avocado\Content\AddHeroBannerPreload::class),

    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js')
        ->css(__DIR__.'/less/admin.less'),

    new Extend\Locales(__DIR__.'/locale'),

    (new Extend\Routes('api'))
        ->post('/avocado/banner', 'avocado.banner.upload', \Ramon\Avocado\Controller\UploadBannerController::class)
        ->delete('/avocado/banner', 'avocado.banner.delete', \Ramon\Avocado\Controller\DeleteBannerController::class)
        ->post('/avocado/auth-image', 'avocado.auth_image.upload', \Ramon\Avocado\Controller\UploadAuthImageController::class)
        ->delete('/avocado/auth-image', 'avocado.auth_image.delete', \Ramon\Avocado\Controller\DeleteAuthImageController::class),

    (new Extend\Settings())
        ->serializeToForum('avocadoHeroImage', 'avocado.hero_image')
        ->serializeToForum('avocadoHeroImagePosition', 'avocado.hero_image_position')
        ->serializeToForum('avocadoAuthImage', 'avocado.auth_image')
        ->serializeToForum('avocadoHomeEnabled', 'avocado.home_enabled', 'boolval')
        ->serializeToForum('avocadoShowAuthButtons', 'avocado.show_auth_buttons', 'boolval')
        ->serializeToForum('avocadoSearchV1', 'avocado.search_v1', 'boolval')
        ->serializeToForum('avocadoShowShare', 'avocado.show_share', 'boolval')
        ->serializeToForum('avocadoShowActionIcons', 'avocado.show_action_icons', 'boolval')
        ->serializeToForum('avocadoFixedAvatarEffect', 'avocado.fixed_avatar_effect', 'boolval')
        ->default('avocado.hero_image_position', 'center top')
        ->default('avocado.home_enabled', false)
        ->default('avocado.show_auth_buttons', false)
        ->default('avocado.search_v1', true)
        ->default('avocado.show_share', true)
        ->default('avocado.show_action_icons', true)
        ->default('avocado.fixed_avatar_effect', true),
];
