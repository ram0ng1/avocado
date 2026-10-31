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

namespace Ramon\Avocado\Search;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\SearchCriteria;
use Ramon\Avocado\Support\ChangelogProducts;

/**
 * Tira as versões do changelog das listas de discussão do fórum.
 *
 * Continuam vendo as versões, de propósito, a busca com filtro de tag (é como o
 * changelog lista) e a busca por texto. Mesmo desenho do
 * HideHiddenTagsFromAllDiscussionsPage do flarum/tags, inclusive com as uniões.
 */
class HideChangelogFromDiscussionLists
{
    public function __construct(
        protected ChangelogProducts $products,
    ) {
    }

    public function __invoke(DatabaseSearchState $state, SearchCriteria $queryCriteria): void
    {
        if ($state->isFulltextSearch() || $this->filtersByTag($state)) {
            return;
        }

        if (! $this->products->enabled()) {
            return;
        }

        $productIds = $this->products->ids();

        if ($productIds === []) {
            return;
        }

        $apply = static function ($query) use ($productIds): void {
            $query->whereNotIn('discussions.id', static function ($sub) use ($productIds) {
                return $sub->select('discussion_id')
                    ->from('discussion_tag')
                    ->whereIn('tag_id', $productIds);
            });
        };

        $eloquentQuery = $state->getQuery();
        $apply($eloquentQuery);

        // Uniões já montadas por outros mutators (ex.: as fixadas no topo).
        foreach ($eloquentQuery->getQuery()->unions ?? [] as $union) {
            $apply($union['query']);
        }
    }

    private function filtersByTag(DatabaseSearchState $state): bool
    {
        foreach ($state->getActiveFilters() as $filter) {
            if ($filter->getFilterKey() === 'tag') {
                return true;
            }
        }

        return false;
    }
}
