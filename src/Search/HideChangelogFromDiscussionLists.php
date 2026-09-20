<?php

declare(strict_types=1);

namespace Ramon\Avocado\Search;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\SearchCriteria;
use Ramon\Avocado\Support\ChangelogProducts;

/**
 * Tira as versões do changelog das listas de discussão do fórum.
 *
 * Uma versão é uma discussão numa tag de produto, mas o lugar dela é a página do
 * changelog: na home, em "todas as discussões" e no perfil do autor ela só
 * misturaria nota de lançamento com conversa. Duas consultas continuam vendo as
 * versões, de propósito:
 *
 *  - com filtro de TAG — é como o próprio changelog lista, e como o fórum lista
 *    qualquer tag pedida de forma explícita;
 *  - busca por TEXTO — quem procura por um termo quer achar também a nota que o
 *    menciona.
 *
 * Mesmo desenho do HideHiddenTagsFromAllDiscussionsPage do flarum/tags,
 * inclusive o cuidado com as uniões que outros mutators (sticky) já montaram.
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
