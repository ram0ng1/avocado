<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;

/**
 * Expõe `bookmarked` (boolean) na DiscussionResource. A presença é resolvida da
 * relação `avocadoBookmark`, que o endpoint carrega com eagerLoadWhere escopado
 * ao ator (extend.php) — assim o getter lê uma coleção já em memória em vez de
 * disparar um SELECT por discussão (CLAUDE.md §38.1).
 *
 * O campo é só de leitura e fica oculto para visitantes (guests não salvam); o
 * toggle acontece pelos endpoints dedicados POST/DELETE /avocado/bookmark.
 */
class BookmarkFields
{
    public function __invoke(): array
    {
        return [
            Schema\Boolean::make('bookmarked')
                ->visible(fn (Discussion $discussion, Context $context) => ! $context->getActor()->isGuest())
                ->get(function (Discussion $discussion): bool {
                    // relationLoaded evita um lazy-load (N+1) caso algum endpoint
                    // serialize a discussão sem o eager-load do ator.
                    if (! $discussion->relationLoaded('avocadoBookmark')) {
                        return false;
                    }
                    return $discussion->getRelation('avocadoBookmark')->isNotEmpty();
                }),
        ];
    }
}
