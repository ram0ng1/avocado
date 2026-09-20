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

/**
 * Serve /changelog e /changelog/{produto} — o documento é o mesmo do fórum, o
 * conteúdo da página nasce no front (ChangelogPage) e os dados chegam pelo
 * Content\PreloadChangelog.
 *
 * A página só existe com o switch ligado E com o flarum/tags presente: os
 * produtos são tags, sem a extensão não há o que listar.
 */
class ChangelogPageController implements RequestHandlerInterface
{
    public function __construct(
        private SettingsRepositoryInterface $settings,
        // Frontend do fórum entregue por binding contextual no AvocadoServiceProvider,
        // como no TeamPageController.
        private Frontend $frontend
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $enabled = filter_var($this->settings->get('avocado.changelog_enabled', false), FILTER_VALIDATE_BOOL);

        if (! $enabled || ! class_exists(\Flarum\Tags\Tag::class)) {
            throw new RouteNotFoundException();
        }

        return (new FrontendController($this->frontend))->handle($request);
    }
}
