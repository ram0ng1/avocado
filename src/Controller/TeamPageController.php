<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Frontend\Controller as FrontendController;
use Flarum\Frontend\Frontend;
use Flarum\Http\Exception\RouteNotFoundException;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class TeamPageController implements RequestHandlerInterface
{
    public function __construct(
        private SettingsRepositoryInterface $settings,
        // Frontend do fórum entregue por binding contextual (AvocadoServiceProvider).
        private Frontend $frontend
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        if (!$this->settings->get('avocado.team_page_enabled', false)) {
            throw new RouteNotFoundException();
        }

        return (new FrontendController($this->frontend))->handle($request);
    }
}
