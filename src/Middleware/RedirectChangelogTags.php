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

namespace Ramon\Avocado\Middleware;

use Flarum\Http\RequestUtil;
use Flarum\Http\SlugManager;
use Flarum\Http\UrlGenerator;
use Flarum\Tags\Tag;
use Flarum\User\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Laminas\Diactoros\Response\RedirectResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Avocado\Support\ChangelogProducts;

/**
 * `/t/produto` e `/t/subtag` redirecionam para `/changelog/produto[?type=subtag]`.
 * Roda depois da autenticação, para uma tag restrita não ser revelada, e antes
 * de ExecuteRoute. 302 e não 301: a lista de produtos é configuração e um 301
 * ficaria no cache do navegador.
 */
final class RedirectChangelogTags implements MiddlewareInterface
{
    public function __construct(
        private readonly ChangelogProducts $products,
        private readonly SlugManager $slugs,
        private readonly UrlGenerator $url,
    ) {
    }

    #[\Override]
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if ($request->getAttribute('routeName') !== 'tag' || ! in_array($request->getMethod(), ['GET', 'HEAD'], true)) {
            return $handler->handle($request);
        }

        $parameters = $request->getAttribute('routeParameters');
        $slug = is_array($parameters) ? ($parameters['slug'] ?? null) : null;

        if (! is_string($slug) || $slug === '' || ! $this->products->enabled()) {
            return $handler->handle($request);
        }

        $target = $this->target($slug, RequestUtil::getActor($request));

        return $target === null ? $handler->handle($request) : new RedirectResponse($target, 302);
    }

    private function target(string $slug, User $actor): ?string
    {
        $productIds = $this->products->ids();

        if ($productIds === []) {
            return null;
        }

        $driver = $this->slugs->forResource(Tag::class);

        try {
            /** @var Tag $tag */
            $tag = $driver->fromSlug($slug, $actor);
        } catch (ModelNotFoundException) {
            // Tag inexistente ou invisível para este visitante: segue o fluxo normal (404).
            return null;
        }

        $forum = $this->url->to('forum');

        if (in_array((int) $tag->id, $productIds, true)) {
            return $forum->route('avocado-changelog.product', ['product' => $driver->toSlug($tag)]);
        }

        if ($tag->parent_id !== null && in_array((int) $tag->parent_id, $productIds, true)) {
            $parent = Tag::query()->find($tag->parent_id);

            if ($parent instanceof Tag) {
                return $forum->route('avocado-changelog.product', ['product' => $driver->toSlug($parent)])
                    .'?type='.rawurlencode($driver->toSlug($tag));
            }
        }

        return null;
    }
}
