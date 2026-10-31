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

namespace Ramon\Avocado\Content;

use Flarum\Api\Client;
use Flarum\Frontend\Document;
use Psr\Http\Message\ServerRequestInterface;
use Ramon\Avocado\Support\ChangelogProducts;

/**
 * Primeira página do changelog no payload do boot (`app.data.avocadoChangelog`),
 * para a página não nascer em skeleton. O content roda em toda página; o guard
 * de rota mantém as consultas fora das outras.
 */
class PreloadChangelog
{
    /** Nomes de rota registrados em extend.php. */
    private const ROUTES = ['avocado-changelog', 'avocado-changelog.product'];

    /** Espelha CHANGELOG_PAGE_LIMIT do ChangelogState. */
    private const PAGE_LIMIT = 12;

    /**
     * Espelha o include do ChangelogState. Sem firstPost: o card lê `avocadoExcerpt`,
     * e incluir o post só custaria o render do s9e.
     */
    private const INCLUDES = 'user,tags';

    public function __construct(
        protected Client $api,
        protected ChangelogProducts $products,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (! in_array($request->getAttribute('routeName'), self::ROUTES, true) || ! $this->products->enabled()) {
            return;
        }

        $slugs = $this->products->slugs();

        if (! $slugs) {
            return;
        }

        // `{product}` chega em queryParams: o Flarum funde os parâmetros da rota lá.
        $product = $request->getQueryParams()['product'] ?? null;

        if ($product !== null) {
            // Só produtos configurados: um slug qualquer viraria um filtro
            // arbitrário no boot. O front trata o produto desconhecido como 404.
            if (! is_string($product) || ! in_array($product, $slugs, true)) {
                return;
            }

            $slugs = [$product];
        }

        $tags = $this->get($request, '/tags', ['include' => 'children,parent']);
        $discussions = $this->get($request, '/discussions', [
            // Vírgula = OR entre os produtos, resolvido num único request.
            'filter'  => ['tag' => implode(',', $slugs)],
            'include' => self::INCLUDES,
            'sort'    => '-createdAt',
            'page'    => ['limit' => self::PAGE_LIMIT],
        ]);

        if ($tags === null || $discussions === null) {
            return;
        }

        // `product` diz para qual rota o preload vale.
        $document->payload['avocadoChangelog'] = [
            'product'     => is_string($product) ? $product : null,
            'tags'        => $this->document($tags),
            'discussions' => $this->document($discussions) + ['links' => $discussions['links'] ?? []],
        ];
    }

    /**
     * @param  array<string, mixed> $query
     * @return array<string, mixed>|null
     */
    private function get(ServerRequestInterface $request, string $path, array $query): ?array
    {
        try {
            $body = (string) $this->api
                ->withoutErrorHandling()
                // Roda como o visitante real: o boot nunca entrega no payload
                // uma discussão ou tag que ele não veria pela API.
                ->withParentRequest($request)
                ->withQueryParams($query)
                ->get($path)
                ->getBody();

            $decoded = json_decode($body, true);

            return is_array($decoded) ? $decoded : null;
        } catch (\Throwable) {
            // Preload é otimização: se falhar, o front cai no fetch async.
            return null;
        }
    }

    /**
     * @param  array<string, mixed> $doc
     * @return array{data: list<array<string, mixed>>, included: list<array<string, mixed>>}
     */
    private function document(array $doc): array
    {
        return [
            'data'     => $doc['data'] ?? [],
            'included' => $doc['included'] ?? [],
        ];
    }
}
