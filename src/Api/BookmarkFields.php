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

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Ramon\Avocado\Support\BookmarksSetting;

/**
 * Estado do bookmark do ator na discussão. O prefixo evita colidir com o
 * `bookmarked` do fof/bookmarks na mesma resource. A relação vem eager-carregada
 * e filtrada por user_id = ator, então nota e lembrete nunca vazam entre usuários.
 * Só leitura; as escritas vão pelos endpoints /avocado/bookmark.
 */
class BookmarkFields
{
    public function __construct(
        protected BookmarksSetting $bookmarks
    ) {
    }

    public function __invoke(): array
    {
        $notGuest = fn (Discussion $discussion, Context $context) => ! $context->getActor()->isGuest()
            && $this->bookmarks->enabled();

        return [
            Schema\Boolean::make('avocadoBookmarked')
                ->visible($notGuest)
                ->get(fn (Discussion $discussion): bool => self::actorBookmark($discussion) !== null),

            Schema\Str::make('avocadoBookmarkNote')
                ->nullable()
                ->visible($notGuest)
                ->get(fn (Discussion $discussion): ?string => self::actorBookmark($discussion)?->note),

            Schema\Str::make('avocadoBookmarkRemindAt')
                ->nullable()
                ->visible($notGuest)
                ->get(fn (Discussion $discussion): ?string => self::actorBookmark($discussion)?->remind_at?->toIso8601String()),
        ];
    }

    /**
     * relationLoaded evita um lazy-load (N+1) quando o endpoint não fez o eager-load.
     */
    private static function actorBookmark(Discussion $discussion): ?\Ramon\Avocado\Model\Bookmark
    {
        if (! $discussion->relationLoaded('avocadoBookmark')) {
            return null;
        }

        return $discussion->getRelation('avocadoBookmark')->first();
    }
}
