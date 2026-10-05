<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Flarum\Tags\Tag;
use Flarum\User\User;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Database\ConnectionInterface;
use Ramon\Avocado\Support\ChangelogProducts;

/**
 * As versões do changelog não entram na contagem de discussões.
 *
 * `users.discussion_count` e `tags.discussion_count` são colunas mantidas pelo
 * core/flarum-tags a cada discussão criada; mexer nos ouvintes que as mantêm
 * seria reescrever esse código. Aqui só o que sai no JSON muda: cada contagem
 * perde as versões que a compõem — as do autor, no usuário; as que carrega, na
 * tag (uma tag de produto, ou de tipo, lê 0, porque tudo nela é versão).
 *
 * Uma consulta agrupada por request (as versões são poucas e a subconsulta usa
 * o índice de `discussion_tag`) em vez de uma por usuário ou tag do documento.
 * O resultado fica memorizado na instância — singleton no AvocadoServiceProvider,
 * a mesma que o extend.php entrega aos dois campos.
 *
 * Entre requests, os dois mapas ficam no cache do Flarum: só mudam quando uma
 * discussão nasce, some ou troca de tag, e cada um desses eventos chama
 * `flush()` (extend.php, mesmo padrão dos ouvintes do fof/*). Sem isso, toda
 * página com usuário ou tag no documento — praticamente todas — pagava as duas
 * consultas agrupadas. O TTL é só rede de segurança para uma escrita que não
 * passe pelos eventos (SQL direto, importação).
 */
final class ChangelogCounts
{
    /** Chave única: a lista de produtos vai junto do valor e é conferida na leitura. */
    public const CACHE_KEY = 'avocado.changelog_counts.v1';

    private const CACHE_TTL = 3600;

    /** @var array<int, int>|null autor => versões */
    private ?array $byAuthor = null;

    /** @var array<int, int>|null tag => versões */
    private ?array $byTag = null;

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly ChangelogProducts $products,
        private readonly Cache $cache,
    ) {
    }

    public function forUsers(Schema\Integer $field): Schema\Integer
    {
        return $field->get(fn (User $user): int => max(
            0,
            (int) $user->discussion_count - ($this->byAuthor()[(int) $user->id] ?? 0)
        ));
    }

    public function forTags(Schema\Integer $field): Schema\Integer
    {
        return $field->get(fn (Tag $tag): int => max(
            0,
            (int) $tag->discussion_count - ($this->byTag()[(int) $tag->id] ?? 0)
        ));
    }

    /** Ponto de teste — zera os memos do request. */
    public function forget(): void
    {
        $this->byAuthor = null;
        $this->byTag = null;
    }

    /**
     * Invalida o cache entre requests e os memos deste. Chamado pelos ouvintes
     * de discussão/tag no extend.php.
     */
    public function flush(): void
    {
        $this->cache->forget(self::CACHE_KEY);
        $this->forget();
    }

    /** @return array<int, int> */
    private function byAuthor(): array
    {
        if ($this->byAuthor === null) {
            $this->load();
        }

        return $this->byAuthor ?? [];
    }

    /** @return array<int, int> */
    private function byTag(): array
    {
        if ($this->byTag === null) {
            $this->load();
        }

        return $this->byTag ?? [];
    }

    /**
     * Preenche os dois mapas de uma vez: do cache quando a lista de produtos
     * gravada bate com a atual (trocar `avocado.changelog_tags` invalida sozinho),
     * senão das duas consultas — e regrava.
     */
    private function load(): void
    {
        $ids = $this->releaseIds();

        if ($ids === []) {
            // Changelog desligado ou sem produtos: nada a descontar, nem a ler.
            $this->byAuthor = $this->byTag = [];

            return;
        }

        $cached = $this->cache->get(self::CACHE_KEY);

        if (is_array($cached) && ($cached['ids'] ?? null) === $ids && is_array($cached['byAuthor'] ?? null) && is_array($cached['byTag'] ?? null)) {
            $this->byAuthor = $cached['byAuthor'];
            $this->byTag = $cached['byTag'];

            return;
        }

        $this->byAuthor = Discussion::query()
            ->whereIn('id', $this->releaseDiscussions())
            ->selectRaw('user_id, count(*) as releases')
            ->groupBy('user_id')
            ->pluck('releases', 'user_id')
            ->map(static fn ($n): int => (int) $n)
            ->all();

        $this->byTag = $this->db
            ->table('discussion_tag')
            ->whereIn('discussion_id', $this->releaseDiscussions())
            ->selectRaw('tag_id, count(*) as releases')
            ->groupBy('tag_id')
            ->pluck('releases', 'tag_id')
            ->map(static fn ($n): int => (int) $n)
            ->all();

        $this->cache->put(self::CACHE_KEY, [
            'ids'      => $ids,
            'byAuthor' => $this->byAuthor,
            'byTag'    => $this->byTag,
        ], self::CACHE_TTL);
    }

    /** @return list<int> */
    private function releaseIds(): array
    {
        return $this->products->enabled() ? $this->products->ids() : [];
    }

    /** Subconsulta: os ids das discussões que estão numa tag de produto. */
    private function releaseDiscussions(): \Closure
    {
        $productIds = $this->releaseIds();

        return static function ($query) use ($productIds): void {
            $query->select('discussion_id')->from('discussion_tag')->whereIn('tag_id', $productIds);
        };
    }
}
