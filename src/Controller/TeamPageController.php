<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Frontend\Controller as FrontendController;
use Flarum\Http\Exception\RouteNotFoundException;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Container\Container;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class TeamPageController implements RequestHandlerInterface
{
    public function __construct(
        private SettingsRepositoryInterface $settings,
        private Container $container
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        if (!$this->settings->get('avocado.team_page_enabled', false)) {
            throw new RouteNotFoundException();
        }

        $frontend = $this->container->make('flarum.frontend.forum');

        return (new FrontendController($frontend))->handle($request);
    }
}
