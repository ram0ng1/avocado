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

namespace Ramon\Avocado\Content;

use Carbon\Carbon;
use Flarum\Frontend\Document;
use Flarum\Http\RequestUtil;
use Flarum\Http\SlugManager;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Quem está online, no <head> (window.__avocadoOnlineUsers), para os avatares
 * saírem no primeiro paint. A consulta fica 30s no cache: o conjunto quase não
 * muda entre requests e a tabela users não deve escalar com cada página vista.
 */
class InjectOnlineUsers
{
    /** Curto o bastante para parecer tempo real, longo o bastante para absorver picos. */
    private const CACHE_TTL = 30;

    private const CACHE_KEY = 'avocado.online_users.payload';

    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected CacheRepository $cache,
        protected SlugManager $slugManager,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (! $this->settings->get('avocado.show_online_users', true)) {
            $document->head[] = '<script>window.__avocadoOnlineUsers=[];</script>';
            return;
        }

        // Presença é informação da comunidade: visitantes e contas que não
        // podem ver o fórum (fórum fechado, e-mail não confirmado) não recebem.
        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest() || $actor->cannot('viewForum')) {
            $document->head[] = '<script>window.__avocadoOnlineUsers=[];</script>';
            return;
        }

        $users = $this->cache->remember(
            self::CACHE_KEY,
            self::CACHE_TTL,
            fn () => $this->fetchOnlineUsers()
        );

        // JSON_HEX_*: um nome de usuário (ou apelido) com HTML não fecha o <script>.
        $json = json_encode(
            $users,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        );
        $document->head[] = "<script>window.__avocadoOnlineUsers={$json};</script>";
    }

    /**
     * `slug` sai do slug driver configurado (o IdSlugDriver usa o id), não do username.
     *
     * @return array<int, array{id: int, username: string, slug: string, displayName: string, avatarUrl: ?string}>
     */
    private function fetchOnlineUsers(): array
    {
        $driver = $this->slugManager->forResource(User::class);

        return User::select(['id', 'username', 'avatar_url', 'preferences'])
            ->where('last_seen_at', '>=', Carbon::now()->subMinutes(5))
            // Os mais recentes primeiro; folga para quem esconde o status
            // (preferência em JSON, filtrada aqui) não encurtar a lista.
            ->orderByDesc('last_seen_at')
            ->limit(100)
            ->get()
            ->filter(fn (User $u) => $u->preferences['discloseOnline'] ?? true)
            ->take(50)
            ->map(fn (User $u) => [
                'id'          => $u->id,
                'username'    => $u->username,
                'slug'        => $driver->toSlug($u),
                'displayName' => $u->display_name,
                'avatarUrl'   => $u->avatar_url,
            ])
            ->values()
            ->toArray();
    }
}
