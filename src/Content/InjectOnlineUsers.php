<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Carbon\Carbon;
use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Injects online-user data directly into <head> as window.__avocadoOnlineUsers
 * so the JS component can render avatars synchronously on first paint — no API
 * round-trip, no layout-shift after page load.
 */
class InjectOnlineUsers
{
    public function __construct(protected SettingsRepositoryInterface $settings)
    {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (!$this->settings->get('avocado.show_online_users', true)) {
            $document->head[] = '<script>window.__avocadoOnlineUsers=[];</script>';
            return;
        }

        $users = User::select(['id', 'username', 'avatar_url', 'preferences'])
            ->where('last_seen_at', '>=', Carbon::now()->subMinutes(5))
            ->limit(50)
            ->get()
            ->filter(fn(User $u) => $u->preferences['discloseOnline'] ?? true)
            ->map(fn(User $u) => [
                'id'          => $u->id,
                'username'    => $u->username,
                'displayName' => $u->display_name,
                'avatarUrl'   => $u->avatar_url
                    ? rtrim((string) app('flarum.config')->url(), '/') . '/assets/avatars/' . $u->avatar_url
                    : null,
            ])
            ->values()
            ->toArray();

        $json = json_encode($users, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $document->head[] = "<script>window.__avocadoOnlineUsers={$json};</script>";
    }
}
