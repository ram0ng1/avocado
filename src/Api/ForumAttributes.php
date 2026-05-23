<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema\Attribute;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\Tags\Tag;
use Flarum\User\User;

class ForumAttributes
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
    ) {
    }

    public function __invoke(): array
    {
        return [
            Attribute::make('avocadoTeamPageMemberCount')
                ->get(function () {
                    if (! $this->settings->get('avocado.team_page_enabled', false)) {
                        return 0;
                    }

                    $raw = (string) ($this->settings->get('avocado.team_page_groups') ?: '[]');
                    $groupIds = json_decode($raw, true);

                    if (empty($groupIds) || ! is_array($groupIds)) {
                        return 0;
                    }

                    return User::query()
                        ->whereHas('groups', fn ($q) => $q->whereIn('groups.id', $groupIds))
                        ->count();
                }),

            Attribute::make('avocadoShowcaseItemCount')
                ->get(function () {
                    if (! $this->settings->get('avocado.showcase_enabled', false)) {
                        return 0;
                    }

                    $tagId = (int) $this->settings->get('avocado.showcase_tag');
                    if (! $tagId) {
                        return 0;
                    }

                    $limit = (int) ($this->settings->get('avocado.showcase_count') ?: 5);

                    /** @var Tag|null $tag */
                    $tag = Tag::query()->find($tagId);
                    if (! $tag) {
                        return 0;
                    }

                    return min($tag->discussions()->count(), $limit);
                }),

            // NOTE: the online-user list is NOT exposed here. It is injected
            // server-side into <head> as window.__avocadoOnlineUsers by
            // Content\InjectOnlineUsers (single source of truth — see §37 of
            // CLAUDE.md). Duplicating it as an API attribute ran the same
            // users-table scan twice on every forum page load.
        ];
    }
}
