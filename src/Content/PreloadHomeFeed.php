<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Api\Client;
use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Preloads the home discussion list into the boot payload as
 * `app.data.avocadoHomeFeed` — só quando a página da index não basta.
 *
 * A index entrega 20 discussões no boot e é delas que a lista da home sai. As
 * do showcase não entram na conta, então com 15 ou 20 itens configurados a
 * lista podia ficar curta e o front completava com um GET depois do 1º paint:
 * a lista crescia na frente do usuário. Ver docs/preload-sem-flash.md: dado
 * necessário no 1º paint tem que vir no payload do boot.
 *
 * Registrado globalmente em extend.php; o guard de rota e a conta abaixo
 * mantêm a consulta fora das outras páginas e das homes que não precisam dela.
 */
class PreloadHomeFeed
{
    /** Mesmas rotas do PreloadShowcase: a home vive na raiz e em /all. */
    private const ROUTES = ['default', 'index'];

    /** Espelha o SHOWCASE_INCLUDE do HomeState (sem posts — ver PreloadShowcase). */
    private const INCLUDES = 'user,lastPostedUser,tags';

    /** Tamanho da página que a index já entrega no boot (padrão do Flarum). */
    private const INDEX_PAGE_SIZE = 20;

    /** Teto do request, igual ao do front (HomeState › fillFeed). */
    private const MAX_LIMIT = 50;

    public function __construct(
        protected Client $api,
        protected SettingsRepositoryInterface $settings,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (! in_array($request->getAttribute('routeName'), self::ROUTES, true)) {
            return;
        }

        // Página 2+ da index ou busca: a home não é o que está na tela.
        $query = $request->getQueryParams();
        if (! empty($query['q']) || (int) ($query['page'] ?? 1) > 1) {
            return;
        }

        $count = max(1, min(20, (int) ($this->settings->get('avocado.home_feed_count') ?: 5)));
        $showcase = $this->settings->get('avocado.showcase_enabled', false)
            ? max(1, min(5, (int) ($this->settings->get('avocado.showcase_count') ?: 5)))
            : 0;

        // No pior caso todas as discussões do showcase estão entre as 20 da
        // index; se ainda assim sobram `count`, a página do boot já basta.
        $needed = $count + $showcase;
        if ($needed <= self::INDEX_PAGE_SIZE) {
            return;
        }

        $doc = $this->fetch($request, min(self::MAX_LIMIT, $needed), empty($query['sort']));

        if (! $doc || ! ($doc['data'] ?? [])) {
            return;
        }

        // Vira app.data.avocadoHomeFeed no front, no formato que
        // store.pushPayload() consome direto.
        $document->payload['avocadoHomeFeed'] = [
            'data'     => $doc['data'],
            'included' => $doc['included'] ?? [],
        ];
    }

    /**
     * @return array{data?: list<array<string, mixed>>, included?: list<array<string, mixed>>}|null
     */
    private function fetch(ServerRequestInterface $request, int $limit, bool $defaultIndexOrder): ?array
    {
        $params = [
            'include' => self::INCLUDES,
            'page'    => ['limit' => $limit],
        ];

        // "Atividade recente" pede a ordem explícita; "populares" é pontuado no
        // front sobre a ordem padrão, a mesma da index.
        if ($this->settings->get('avocado.home_feed_sort') === 'latest') {
            $params['sort'] = '-lastPostedAt';
        } elseif ($defaultIndexOrder) {
            // Mesma ordem da index: as 20 primeiras já estão no apiDocument do
            // boot, e o front junta as duas listas (HomeState › feedCandidates).
            // Pedir só o que vem depois delas evita serializar de novo as 20
            // linhas — o conjunto final é o mesmo.
            $params['page'] = [
                'offset' => self::INDEX_PAGE_SIZE,
                'limit'  => $limit - self::INDEX_PAGE_SIZE,
            ];
        }

        try {
            $body = (string) $this->api
                ->withoutErrorHandling()
                // Roda como o visitante real: o boot nunca entrega no payload
                // uma discussão que ele não veria pela API.
                ->withParentRequest($request)
                ->withQueryParams($params)
                ->get('/discussions')
                ->getBody();

            $decoded = json_decode($body, true);

            return is_array($decoded) ? $decoded : null;
        } catch (\Throwable) {
            // Preload é otimização: se falhar, o front cai no fetch async.
            return null;
        }
    }
}
