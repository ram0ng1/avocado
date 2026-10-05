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
 * O resultado fica memorizado na instância — singleton no AvocadoServiceProvider,
 * a mesma que o extend.php entrega aos dois campos.
 */
final class ChangelogCounts
{
    /** @var array<int, int>|null autor => versões */
    private ?array $byAuthor = null;

    /** @var array<int, int>|null tag => versões */
    private ?array $byTag = null;

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly ChangelogProducts $products,
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

    /** @return array<int, int> */
    private function byAuthor(): array
    {
        return $this->byAuthor ??= $this->releaseIds() === []
            ? []
            : Discussion::query()
                ->whereIn('id', $this->releaseDiscussions())
                ->selectRaw('user_id, count(*) as releases')
                ->groupBy('user_id')
                ->pluck('releases', 'user_id')
                ->map(static fn ($n): int => (int) $n)
                ->all();
    }

    /** @return array<int, int> */
    private function byTag(): array
    {
        return $this->byTag ??= $this->releaseIds() === []
            ? []
            : $this->db
                ->table('discussion_tag')
                ->whereIn('discussion_id', $this->releaseDiscussions())
                ->selectRaw('tag_id, count(*) as releases')
                ->groupBy('tag_id')
                ->pluck('releases', 'tag_id')
                ->map(static fn ($n): int => (int) $n)
                ->all();
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
