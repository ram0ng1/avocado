<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Carbon\Carbon;
use Flarum\Api\Schema\Attribute;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;

class ForumAttributes
{
    public function __construct(protected SettingsRepositoryInterface $settings)
    {
    }

    public function __invoke(): array
    {
        return [
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
