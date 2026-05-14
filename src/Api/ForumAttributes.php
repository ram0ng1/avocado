<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema\Attribute;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Database\ConnectionInterface;

class ForumAttributes
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected ConnectionInterface $db,
    ) {
    }

    public function __invoke(): array
    {
        return [
            Attribute::make('avocadoTeamPageMemberCount')
                ->get(function () {
                    if (!$this->settings->get('avocado.team_page_enabled', false)) {
                        return 0;
                    }

                    $raw = (string) ($this->settings->get('avocado.team_page_groups') ?: '[]');
                    $groupIds = json_decode($raw, true);

                    if (empty($groupIds) || !is_array($groupIds)) {
                        return 0;
                    }

                    return (int) $this->db->table('users')
                        ->join('group_user', 'users.id', '=', 'group_user.user_id')
                        ->whereIn('group_user.group_id', $groupIds)
                        ->distinct('users.id')
                        ->count('users.id');
                }),

            Attribute::make('avocadoShowcaseItemCount')
                ->get(function () {
                    if (!$this->settings->get('avocado.showcase_enabled', false)) {
                        return 0;
                    }

                    $tagId = (int) $this->settings->get('avocado.showcase_tag');
                    if (!$tagId) {
                        return 0;
                    }

                    $limit = (int) ($this->settings->get('avocado.showcase_count') ?: 5);

                    $count = $this->db->table('discussion_tag')
                        ->where('tag_id', $tagId)
                        ->count();

                    return min($count, $limit);
                }),

            // NOTE: the online-user list is NOT exposed here. It is injected
            // server-side into <head> as window.__avocadoOnlineUsers by
            // Content\InjectOnlineUsers (single source of truth — see §37 of
            // CLAUDE.md). Duplicating it as an API attribute ran the same
            // users-table scan twice on every forum page load.
        ];
    }
}
