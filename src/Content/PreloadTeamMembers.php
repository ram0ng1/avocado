<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Api\Client;
use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Preloads the /team member list into the boot payload as `app.data.avocadoTeam`.
 *
 * Without this, TeamPage mounted with `loading = true`, fired one
 * `app.store.find('users', { filter: { group } })` per configured group and only
 * swapped the skeleton for real cards once every request had resolved — a
 * guaranteed flash on a page whose entire content is that list.
 *
 * The /team route is served by TeamPageController, which produces a frontend
 * document with no route-specific apiDocument, so nothing about the team was in
 * the boot at all.
 *
 * Registered globally in extend.php (Extend\Frontend runs its content on every
 * forum page), so the route guard below is what keeps the queries off every
 * other page. Guarding on routeName rather than mutating the shared Frontend
 * instance from the controller keeps this free of per-request state.
 */
class PreloadTeamMembers
{
    /** Matches the route name registered in extend.php. */
    private const ROUTE = 'avocado-team';

    /** Mirrors the page[limit] used by TeamPage.load(). */
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

        // Vira app.data.avocadoTeam no front, no formato que store.pushPayload()
        // consome direto.
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
                // withParentRequest faz a chamada rodar como o visitante real,
                // então o preload respeita a visibilidade de usuários — um guest
                // não recebe no boot nada que não veria pela API.
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
            // Guests levam 403 aqui (listar usuários é permissão), o que é o
            // comportamento correto — o front cai no fetch e trata igual.
            return null;
        }
    }
}
