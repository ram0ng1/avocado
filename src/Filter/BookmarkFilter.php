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

namespace Ramon\Avocado\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use Ramon\Avocado\Support\BookmarksSetting;

/**
 * Discussões salvas pelo ator (página "Salvos"), como o SubscriptionFilter do
 * core. O prefixo evita somar (AND) com o filtro `bookmarked` do fof/bookmarks
 * na mesma busca.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class BookmarkFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function __construct(
        protected BookmarksSetting $bookmarks
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

        // Desligado vira conjunto vazio: um no-op listaria TODAS as discussões em /bookmarks.
        if (! $this->bookmarks->enabled()) {
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
