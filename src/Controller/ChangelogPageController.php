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

use Flarum\Extension\ExtensionManager;
use Flarum\Frontend\Controller as FrontendController;
use Flarum\Frontend\Frontend;
use Flarum\Http\Exception\RouteNotFoundException;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * /changelog e /changelog/{produto}. Exige o switch E o flarum/tags: os
 * produtos são tags. Os dados chegam pelo Content\PreloadChangelog.
 */
class ChangelogPageController implements RequestHandlerInterface
{
    public function __construct(
        private SettingsRepositoryInterface $settings,
        private Frontend $frontend,
        private ExtensionManager $extensions,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $enabled = filter_var($this->settings->get('avocado.changelog_enabled', false), FILTER_VALIDATE_BOOL);

        if (! $enabled || ! $this->extensions->isEnabled('flarum-tags')) {
            throw new RouteNotFoundException();
        }

        return (new FrontendController($this->frontend))->handle($request);
    }
}
