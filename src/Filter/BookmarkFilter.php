<?php

declare(strict_types=1);

namespace Ramon\Avocado\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use Ramon\Avocado\Support\BookmarksSetting;

/**
 * Filtro `avocadoBookmarked` para a busca de discussões — restringe o resultado
 * às discussões salvas pelo ator. Alimenta a página "Salvos". Espelha a forma do
 * SubscriptionFilter do core (whereIn por subconsulta no índice da companion
 * table). Guests nunca têm bookmarks, então caem num conjunto vazio.
 *
 * A chave é prefixada porque o fof/bookmarks registra um filtro `bookmarked` na
 * mesma DiscussionSearcher: com a chave repetida os dois filtros entram na
 * mesma query (AND) e a página do tema devolveria a interseção dos dois
 * sistemas — quase sempre vazia.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class BookmarkFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function __construct(
        protected SettingsRepositoryInterface $settings
    ) {
    }

    public function getFilterKey(): string
    {
        return 'avocadoBookmarked';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        // Qualquer valor verdadeiro liga o filtro; valor falso é no-op.
        if (! $this->asBool($this->asString($value))) {
            return;
        }

        // Sistema desligado: o filtro vira conjunto vazio em vez de no-op —
        // um no-op devolveria TODAS as discussões na página /bookmarks.
        if (! BookmarksSetting::enabled($this->settings)) {
            $state->getQuery()->whereRaw('1 = 0');

            return;
        }

        $this->constrain($state->getQuery(), $state->getActor(), $negate);
    }

    protected function constrain(Builder $query, User $actor, bool $negate): void
    {
        if ($actor->isGuest()) {
            $query->whereRaw('1 = 0');

            return;
        }

        $method = $negate ? 'whereNotIn' : 'whereIn';
        $query->$method('discussions.id', function ($query) use ($actor) {
            $query->select('discussion_id')
                ->from('avocado_bookmarks')
                ->where('user_id', $actor->id);
        });
    }

    private function asBool(string $value): bool
    {
        return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
    }
}
