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

use Flarum\Api\Schema;
use Flarum\Http\SlugManager;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Model;
use Ramon\Avocado\Model\SupportEvent;
use Ramon\Avocado\Support\SupportEvents;

/**
 * Linha do tempo de status do ticket do linkrobins/support, com nome e avatar
 * inline. No PATCH a relação não vem eager-carregada, então o campo a carrega:
 * um `[]` apagaria a linha do tempo no store.
 */
class SupportEventFields
{
    public function __construct(
        protected SupportEvents $events,
        protected SlugManager $slugManager
    ) {
    }

    public function __invoke(): array
    {
        return [
            Schema\Arr::make('avocadoEvents')
                ->visible(fn () => $this->events->available())
                ->get(function (Model $ticket): array {
                    if (! $ticket->relationLoaded('avocadoEvents')) {
                        $ticket->load('avocadoEvents.user');
                    }

                    // O link do perfil usa o slug do driver configurado (id no
                    // IdSlugDriver), não o username.
                    $driver = $this->slugManager->forResource(User::class);

                    return $ticket->getRelation('avocadoEvents')
                        ->map(fn (SupportEvent $event) => [
                            'id'          => $event->id,
                            'type'        => $event->type,
                            'fromStatus'  => $event->from_status,
                            'toStatus'    => $event->to_status,
                            'createdAt'   => $event->created_at?->toIso8601String(),
                            'userId'      => $event->user_id,
                            'username'    => $event->user?->username,
                            'slug'        => $event->user ? $driver->toSlug($event->user) : null,
                            'displayName' => $event->user?->display_name,
                            'avatarUrl'   => $event->user?->avatar_url,
                        ])
                        ->values()
                        ->all();
                }),
        ];
    }
}
