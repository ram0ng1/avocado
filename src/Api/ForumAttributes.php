<?php

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
            Attribute::make('avocadoCustomDefaultAvatar')
                ->get(function () {
                    return (bool) $this->settings->get('avocado.custom_default_avatar', true);
                }),

            Attribute::make('avocadoShowGuestCta')
                ->get(function () {
                    return (bool) $this->settings->get('avocado.show_guest_cta', true);
                }),

            Attribute::make('avocadoOnlineUsers')
                ->get(function () {
                    if (!$this->settings->get('avocado.show_online_users', true)) {
                        return [];
                    }

                    return User::where('last_seen_at', '>=', Carbon::now()->subMinutes(5))
                        ->get()
                        ->filter(fn($user) => $user->preferences['discloseOnline'] ?? true)
                        ->map(fn($user) => [
                            'id'          => $user->id,
                            'username'    => $user->username,
                            'displayName' => $user->getDisplayNameAttribute(),
                            'avatarUrl'   => $user->avatar_url,
                            'color'       => $user->color,
                        ])
                        ->values()
                        ->toArray();
                }),
        ];
    }
}
