<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Api\Client;
use Flarum\Frontend\Document;
use Flarum\Http\SlugManager;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Preloads the showcase rail into the boot payload as `app.data.avocadoShowcase`.
 *
 * Sem isso o trilho só podia sair do que o feed da home por acaso tivesse no
 * store (a 1ª página do /discussions, que não conhece as discussões mais
 * antigas da tag) ou de um GET assíncrono por tag — os dois caminhos pintam
 * DEPOIS do primeiro paint, e o segundo trocava a grade de 1 card para 5 na
 * frente do usuário. Ver docs/preload-sem-flash.md: dado necessário no 1º paint
 * tem que vir no payload do boot.
 *
 * Registrado globalmente em extend.php (Extend\Frontend roda o content em toda
 * página do fórum); o guard de rota abaixo é o que mantém a consulta fora das
 * outras páginas.
 */
class PreloadShowcase
{
    /**
     * A home do Avocado é injetada nos contentItems da IndexPage, então ela
     * aparece na raiz (`default`) e em /all (`index`).
     */
    private const ROUTES = ['default', 'index'];

    /** Espelha o SHOWCASE_INCLUDE do HomeState. */
    private const INCLUDES = 'user,firstPost,lastPostedUser,lastPost,tags';

    public function __construct(
        protected Client $api,
        protected SettingsRepositoryInterface $settings,
        protected SlugManager $slugManager,
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
        if (! class_exists(\Flarum\Tags\Tag::class)) {
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

        // Vira app.data.avocadoShowcase no front, no formato que
        // store.pushPayload() consome direto.
        $document->payload['avocadoShowcase'] = [
            'data'     => $doc['data'],
            'included' => $doc['included'] ?? [],
        ];
    }

    /**
     * Slugs das tags configuradas.
     *
     * O filtro `tag` da API resolve por slug através do slug driver ativo — o
     * padrão (Utf8SlugDriver) casa pela coluna `slug`, e o id_with_slug pelo id
     * à frente do hífen. Gerar o slug pelo SlugManager mantém os dois corretos
     * sem hardcode de formato.
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
