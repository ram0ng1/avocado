<?php

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
        // The forum Frontend is supplied via a contextual binding registered in
        // AvocadoServiceProvider::register() — keeps the magic 'flarum.frontend.forum'
        // string out of the controller and avoids injecting the whole container.
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
