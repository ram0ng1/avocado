<?php

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
 * `/t/produto` e `/t/subtag` não têm página própria: o changelog já lista as
 * mesmas discussões, com a linha do tempo e o filtro de tipo. Quem entra por
 * uma dessas URLs (link antigo, favorito, buscador, alguém que colou o
 * endereço) recebe um 302 para `/changelog/produto[?type=subtag]` antes de
 * qualquer conteúdo ser montado — o redirecionamento é da aplicação, não do
 * navegador.
 *
 * O caminho dentro do app não passa por aqui (o Mithril troca a rota sem pedir
 * a página ao servidor); lá, os links de tag já são gerados apontando para o
 * changelog (ver forum/utils/changelog `changelogTagTarget`).
 *
 * Roda depois de ResolveRoute e da autenticação — precisa do nome da rota e do
 * visitante, para uma tag restrita não ser revelada a quem não a enxerga — e
 * antes de ExecuteRoute, que é o que monta a página da tag.
 *
 * 302 e não 301: a lista de produtos é uma configuração, e um redirecionamento
 * permanente ficaria no cache do navegador depois de o admin desfazê-la.
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
