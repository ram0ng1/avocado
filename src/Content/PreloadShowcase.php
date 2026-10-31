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
use Flarum\Extension\ExtensionManager;
use Flarum\Frontend\Document;
use Flarum\Http\SlugManager;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Trilho do showcase no payload do boot (`app.data.avocadoShowcase`): buscado
 * depois, a grade mudaria na frente do usuário. O content roda em toda página;
 * o guard de rota mantém a consulta fora das outras.
 */
class PreloadShowcase
{
    /**
     * A home do Avocado é injetada nos contentItems da IndexPage, então ela
     * aparece na raiz (`default`) e em /all (`index`).
     */
    private const ROUTES = ['default', 'index'];

    /**
     * Espelha o SHOWCASE_INCLUDE do HomeState. Sem posts: o card lê tudo de
     * atributos da discussão, e incluí-los custaria dois renders do s9e por card.
     */
    private const INCLUDES = 'user,lastPostedUser,tags';

    public function __construct(
        protected Client $api,
        protected SettingsRepositoryInterface $settings,
        protected SlugManager $slugManager,
        protected ExtensionManager $extensions,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (! in_array($request->getAttribute('routeName'), self::ROUTES, true)) {
            return;
        }

        if (! $this->settings->get('avocado.showcase_enabled', false)) {
            return;
        }

        // O showcase depende de flarum/tags; sem a extensão não há o que filtrar.
        if (! $this->extensions->isEnabled('flarum-tags')) {
            return;
        }

        $slugs = $this->showcaseTagSlugs();

        if (! $slugs) {
            return;
        }

        $doc = $this->fetchShowcase($request, $slugs);

        if (! $doc || ! ($doc['data'] ?? [])) {
            return;
        }

        $document->payload['avocadoShowcase'] = [
            'data'     => $doc['data'],
            'included' => $doc['included'] ?? [],
        ];
    }

    /**
     * O filtro `tag` resolve pelo slug driver ativo; gerar pelo SlugManager funciona
     * com qualquer driver.
     *
     * @return list<string>
     */
    private function showcaseTagSlugs(): array
    {
        $ids = $this->showcaseTagIds();

        if (! $ids) {
            return [];
        }

        $driver = $this->slugManager->forResource(\Flarum\Tags\Tag::class);
        $tags = \Flarum\Tags\Tag::query()->whereIn('id', $ids)->get();

        $slugs = [];

        /** @var \Flarum\Tags\Tag $tag */
        foreach ($tags as $tag) {
            $slug = $driver->toSlug($tag);

            // Vírgula é o separador de OR do filtro; um slug que a contenha
            // quebraria a query em duas — descarta em vez de gerar lixo.
            if ($slug !== '' && ! str_contains($slug, ',')) {
                $slugs[] = $slug;
            }
        }

        return $slugs;
    }

    /**
     * IDs das tags do showcase: o TagPicker do admin grava um array JSON
     * (`["3","7"]`), instalações antigas podem ter um id solto.
     *
     * @return list<int>
     */
    private function showcaseTagIds(): array
    {
        $raw = trim((string) $this->settings->get('avocado.showcase_tag'));

        if ($raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        $values = is_array($decoded) ? $decoded : [$decoded ?? $raw];

        return array_values(array_unique(array_filter(array_map('intval', $values))));
    }

    /**
     * @param  list<string> $slugs
     * @return array{data?: list<array<string, mixed>>, included?: list<array<string, mixed>>}|null
     */
    private function fetchShowcase(ServerRequestInterface $request, array $slugs): ?array
    {
        $limit = (int) ($this->settings->get('avocado.showcase_count') ?: 5);
        $limit = max(1, min(5, $limit));

        try {
            $body = (string) $this->api
                ->withoutErrorHandling()
                // Roda como o visitante real: o boot nunca entrega no payload
                // uma discussão que ele não veria pela API.
                ->withParentRequest($request)
                ->withQueryParams([
                    // Vírgula = OR entre as tags, resolvido num único request.
                    'filter'  => ['tag' => implode(',', $slugs)],
                    'include' => self::INCLUDES,
                    'sort'    => '-createdAt',
                    'page'    => ['limit' => $limit],
                ])
                ->get('/discussions')
                ->getBody();

            $decoded = json_decode($body, true);

            return is_array($decoded) ? $decoded : null;
        } catch (\Throwable $e) {
            // Preload é otimização: se falhar, o front cai no fetch async.
            return null;
        }
    }
}
