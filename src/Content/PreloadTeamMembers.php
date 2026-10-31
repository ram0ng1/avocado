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
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Membros do /team no payload do boot (`app.data.avocadoTeam`): a página é só
 * essa lista e, buscada depois, nasceria em skeleton. O content roda em toda
 * página; o guard por nome de rota evita estado por request no Frontend compartilhado.
 */
class PreloadTeamMembers
{
    /** Mesmo nome de rota do extend.php. */
    private const ROUTE = 'avocado-team';

    /** Espelha o page[limit] do TeamPage.load(). */
    private const PER_GROUP_LIMIT = 50;

    public function __construct(
        protected Client $api,
        protected SettingsRepositoryInterface $settings,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if ($request->getAttribute('routeName') !== self::ROUTE) {
            return;
        }

        // Mesmo gate do endpoint (searchUsers): sem ele cada grupo montaria um
        // sub-request inteiro só para levar 403.
        if (RequestUtil::getActor($request)->cannot('searchUsers')) {
            return;
        }

        $groupIds = $this->configuredGroupIds();

        if (! $groupIds) {
            return;
        }

        $data = [];
        $included = [];
        $seenData = [];
        $seenIncluded = [];

        foreach ($groupIds as $groupId) {
            $doc = $this->fetchGroupMembers($request, $groupId);

            if ($doc === null) {
                // Preload é otimização: se uma chamada falhar, o front cai no
                // caminho async para essa parte. Não derruba a página.
                continue;
            }

            foreach ($doc['data'] ?? [] as $resource) {
                $key = ($resource['type'] ?? '').':'.($resource['id'] ?? '');

                if (isset($seenData[$key])) {
                    continue;
                }

                $seenData[$key] = true;
                $data[] = $resource;
            }

            foreach ($doc['included'] ?? [] as $resource) {
                $key = ($resource['type'] ?? '').':'.($resource['id'] ?? '');

                if (isset($seenIncluded[$key])) {
                    continue;
                }

                $seenIncluded[$key] = true;
                $included[] = $resource;
            }
        }

        if (! $data) {
            return;
        }

        $document->payload['avocadoTeam'] = [
            'data'     => $data,
            'included' => $included,
        ];
    }

    /** @return list<string> */
    private function configuredGroupIds(): array
    {
        $raw = (string) $this->settings->get('avocado.team_page_groups', '[]');
        $parsed = json_decode($raw, true);

        if (! is_array($parsed)) {
            return [];
        }

        return array_values(array_filter(array_map(
            static fn ($id) => is_scalar($id) ? (string) $id : '',
            $parsed
        )));
    }

    /** @return array{data?: list<array<string, mixed>>, included?: list<array<string, mixed>>}|null */
    private function fetchGroupMembers(ServerRequestInterface $request, string $groupId): ?array
    {
        try {
            $body = (string) $this->api
                ->withoutErrorHandling()
                // Roda como o visitante real: o boot nunca entrega o que ele não veria pela API.
                ->withParentRequest($request)
                ->withQueryParams([
                    'filter'  => ['group' => $groupId],
                    'include' => 'groups',
                    'page'    => ['limit' => self::PER_GROUP_LIMIT],
                ])
                ->get('/users')
                ->getBody();

            $decoded = json_decode($body, true);

            return is_array($decoded) ? $decoded : null;
        } catch (\Throwable $e) {
            // Sem permissão o 403 é o esperado: o front cai no fetch.
            return null;
        }
    }
}
