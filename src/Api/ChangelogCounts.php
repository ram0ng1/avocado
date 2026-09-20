<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Flarum\Tags\Tag;
use Flarum\User\User;
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
 */
final class ChangelogCounts
{
    /** @var array<int, int>|null autor => versões */
    private static ?array $byAuthor = null;

    /** @var array<int, int>|null tag => versões */
    private static ?array $byTag = null;

    public static function forUsers(Schema\Integer $field): Schema\Integer
    {
        return $field->get(static fn (User $user): int => max(
            0,
            (int) $user->discussion_count - (self::byAuthor()[(int) $user->id] ?? 0)
        ));
    }

    public static function forTags(Schema\Integer $field): Schema\Integer
    {
        return $field->get(static fn (Tag $tag): int => max(
            0,
            (int) $tag->discussion_count - (self::byTag()[(int) $tag->id] ?? 0)
        ));
    }

    /** Ponto de teste — zera os memos do request. */
    public static function forget(): void
    {
        self::$byAuthor = null;
        self::$byTag = null;
    }

    /** @return array<int, int> */
    private static function byAuthor(): array
    {
        return self::$byAuthor ??= self::releaseIds() === []
            ? []
            : Discussion::query()
                ->whereIn('id', self::releaseDiscussions())
                ->selectRaw('user_id, count(*) as releases')
                ->groupBy('user_id')
                ->pluck('releases', 'user_id')
                ->map(static fn ($n): int => (int) $n)
                ->all();
    }

    /** @return array<int, int> */
    private static function byTag(): array
    {
        return self::$byTag ??= self::releaseIds() === []
            ? []
            : resolve(ConnectionInterface::class)
                ->table('discussion_tag')
                ->whereIn('discussion_id', self::releaseDiscussions())
                ->selectRaw('tag_id, count(*) as releases')
                ->groupBy('tag_id')
                ->pluck('releases', 'tag_id')
                ->map(static fn ($n): int => (int) $n)
                ->all();
    }

    /** @return list<int> */
    private static function releaseIds(): array
    {
        $products = resolve(ChangelogProducts::class);

        return $products->enabled() ? $products->ids() : [];
    }

    /** Subconsulta: os ids das discussões que estão numa tag de produto. */
    private static function releaseDiscussions(): \Closure
    {
        $productIds = self::releaseIds();

        return static function ($query) use ($productIds): void {
            $query->select('discussion_id')->from('discussion_tag')->whereIn('tag_id', $productIds);
        };
    }
}
