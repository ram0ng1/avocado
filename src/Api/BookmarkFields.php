<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Flarum\Settings\SettingsRepositoryInterface;
use Ramon\Avocado\Support\BookmarksSetting;

/**
 * Expõe `bookmarked` (boolean), `bookmarkNote` e `bookmarkRemindAt` na
 * DiscussionResource. Tudo é resolvido da relação `avocadoBookmark`, que o
 * endpoint carrega com eagerLoadWhere escopado ao ator (extend.php) — assim os
 * getters leem uma coleção já em memória em vez de disparar um SELECT por
 * discussão (CLAUDE.md §38.1). Como a relação é filtrada por user_id = ator,
 * nota e lembrete nunca vazam entre usuários.
 *
 * Os campos são só de leitura e ficam ocultos para visitantes (guests não
 * salvam); as escritas acontecem pelos endpoints dedicados
 * POST/PATCH/DELETE /avocado/bookmark.
 */
class BookmarkFields
{
    public function __construct(
        protected SettingsRepositoryInterface $settings
    ) {
    }

    public function __invoke(): array
    {
        $notGuest = fn (Discussion $discussion, Context $context) => ! $context->getActor()->isGuest()
            && BookmarksSetting::enabled($this->settings);

        return [
            Schema\Boolean::make('bookmarked')
                ->visible($notGuest)
                ->get(fn (Discussion $discussion): bool => self::actorBookmark($discussion) !== null),

            Schema\Str::make('bookmarkNote')
                ->nullable()
                ->visible($notGuest)
                ->get(fn (Discussion $discussion): ?string => self::actorBookmark($discussion)?->note),

            Schema\Str::make('bookmarkRemindAt')
                ->nullable()
                ->visible($notGuest)
                ->get(fn (Discussion $discussion): ?string => self::actorBookmark($discussion)?->remind_at?->toIso8601String()),
        ];
    }

    /**
     * Devolve o bookmark do ator já eager-carregado, ou null. relationLoaded
     * evita um lazy-load (N+1) caso algum endpoint serialize a discussão sem o
     * eager-load escopado.
     */
    private static function actorBookmark(Discussion $discussion): ?\Ramon\Avocado\Model\Bookmark
    {
        if (! $discussion->relationLoaded('avocadoBookmark')) {
            return null;
        }

        return $discussion->getRelation('avocadoBookmark')->first();
    }
}
