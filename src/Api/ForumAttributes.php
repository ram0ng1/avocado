<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Carbon\Carbon;
use Flarum\Api\Schema\Attribute;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Illuminate\Database\Capsule\Manager as DB;

class ForumAttributes
{
    public function __construct(protected SettingsRepositoryInterface $settings)
    {
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

                    return (int) DB::table('users')
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

                    $count = DB::table('discussion_tag')
                        ->where('tag_id', $tagId)
                        ->count();

                    return min($count, $limit);
                }),

            Attribute::make('avocadoOnlineUsers')
                ->get(function () {
                    if (!$this->settings->get('avocado.show_online_users', true)) {
                        return [];
                    }

                    return User::select(['id', 'username', 'avatar_url', 'preferences'])
                        ->where('last_seen_at', '>=', Carbon::now()->subMinutes(5))
                        ->limit(50)
                        ->get()
                        ->filter(fn (User $user) => $user->preferences['discloseOnline'] ?? true)
                        ->map(fn (User $user) => [
                            'id'          => $user->id,
                            'username'    => $user->username,
                            'displayName' => $user->display_name,
                            'avatarUrl'   => $user->avatar_url,
                        ])
                        ->values()
                        ->toArray();
                }),
        ];
    }
}
