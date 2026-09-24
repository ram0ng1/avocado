<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Illuminate\Database\Eloquent\Model;
use Ramon\Avocado\Model\SupportEvent;
use Ramon\Avocado\Support\SupportEvents;

/**
 * `avocadoEvents` no ticket do linkrobins/support: a linha do tempo de status,
 * já com quem mudou (nome e avatar inline, para a página não precisar de mais
 * uma relação carregada). O front (utils/support.tsx) intercala isso com as
 * respostas, como a discussão faz com os event posts.
 *
 * A relação é eager-carregada no Index e no Show (extend.php); num PATCH — a
 * resposta que o front recebe ao trocar o status — é um ticket só, e aí o
 * load fica por conta do campo, senão o store apagaria a linha do tempo com
 * um `[]` até a página recarregar.
 */
class SupportEventFields
{
    public function __invoke(): array
    {
        return [
            Schema\Arr::make('avocadoEvents')
                ->visible(fn () => SupportEvents::available())
                ->get(function (Model $ticket): array {
                    if (! $ticket->relationLoaded('avocadoEvents')) {
                        $ticket->load('avocadoEvents.user');
                    }

                    return $ticket->getRelation('avocadoEvents')
                        ->map(fn (SupportEvent $event) => [
                            'id'          => $event->id,
                            'type'        => $event->type,
                            'fromStatus'  => $event->from_status,
                            'toStatus'    => $event->to_status,
                            'createdAt'   => $event->created_at?->toIso8601String(),
                            'userId'      => $event->user_id,
                            'username'    => $event->user?->username,
                            'displayName' => $event->user?->display_name,
                            'avatarUrl'   => $event->user?->avatar_url,
                        ])
                        ->values()
                        ->all();
                }),
        ];
    }
}
