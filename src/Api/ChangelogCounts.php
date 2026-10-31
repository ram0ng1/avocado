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

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Flarum\Tags\Tag;
use Flarum\User\User;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Database\ConnectionInterface;
use Ramon\Avocado\Support\ChangelogProducts;

/**
 * Desconta as versões do changelog das contagens de discussões do usuário e da
 * tag. As colunas do core continuam como estão; só o valor no JSON muda.
 *
 * Os mapas ficam no cache entre requests e são invalidados pelos eventos de
 * discussão/tag (`flush()`); o TTL cobre escritas fora dos eventos (SQL direto).
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

    /** Invalida o cache e os memos deste request. */
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
     * O cache só vale se a lista de produtos gravada bater com a atual, então
     * trocar `avocado.changelog_tags` o invalida sozinho.
     */
    private function load(): void
    {
        $ids = $this->releaseIds();

        if ($ids === []) {
            $this->byAuthor = $this->byTag = [];

            return;
        }

        $cached = $this->cache->get(self::CACHE_KEY);

        if (is_array($cached) && ($cached['ids'] ?? null) === $ids && is_array($cached['byAuthor'] ?? null) && is_array($cached['byTag'] ?? null)) {
            $this->byAuthor = $cached['byAuthor'];
            $this->byTag = $cached['byTag'];

            return;
        }

        // Mesmos critérios das contagens que estão sendo descontadas: a do
        // usuário (core) ignora privadas; a da tag (flarum/tags), privadas e ocultas.
        $this->byAuthor = Discussion::query()
            ->whereIn('id', $this->releaseDiscussions())
            ->where('is_private', false)
            ->selectRaw('user_id, count(*) as releases')
            ->groupBy('user_id')
            ->pluck('releases', 'user_id')
            ->map(static fn ($n): int => (int) $n)
            ->all();

        $this->byTag = $this->db
            ->table('discussion_tag')
            ->whereIn('discussion_id', fn ($query) => $query->select('id')->from('discussions')
                ->whereIn('id', $this->releaseDiscussions())
                ->where('is_private', false)
                ->whereNull('hidden_at'))
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
