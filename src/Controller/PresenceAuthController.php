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

namespace Ramon\Avocado\Controller;

use Flarum\Discussion\Discussion;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\EmptyResponse;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Pusher\Pusher;

/**
 * Autoriza o presence channel "quem está lendo" de uma discussão visível ao
 * ator. A rota só existe com o flarum/realtime ativo, então o Pusher está no
 * container. Quem desativou discloseOnline entra `hidden` e com um ID opaco:
 * o Pusher entrega o `user_id` de cada membro a todos os inscritos.
 * O CSRF não é isento: o client manda X-CSRF-Token no auth.
 */
class PresenceAuthController implements RequestHandlerInterface
{
    public function __construct(
        protected Pusher $pusher,
        protected SettingsRepositoryInterface $settings
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $enabled = $this->settings->get('avocado.presence_enabled', true);
        if ($enabled !== null && ! filter_var($enabled, FILTER_VALIDATE_BOOL)) {
            return new EmptyResponse(403);
        }

        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest()) {
            return new EmptyResponse(403);
        }

        $body = (array) ($request->getParsedBody() ?? []);
        $channel = (string) Arr::get($body, 'channel_name', '');
        $socketId = (string) Arr::get($body, 'socket_id', '');

        if ($socketId === '' || ! preg_match('~^presence-avocado-discussion=(\d+)$~', $channel, $m)) {
            return new EmptyResponse(403);
        }

        $discussion = Discussion::whereVisibleTo($actor)->find((int) $m[1]);
        if (! $discussion) {
            return new EmptyResponse(403);
        }

        $disclose = (bool) ($actor->getPreference('discloseOnline') ?? true);
        $info = $disclose
            ? [
                'displayName' => $actor->display_name,
                'username'    => $actor->username,
                'avatarUrl'   => $actor->avatar_url,
            ]
            : ['hidden' => true];

        // Sem vínculo com a conta: aleatório por conexão (duas abas = dois
        // membros, o que não importa — ocultos não entram na contagem).
        $memberId = $disclose ? (string) $actor->id : 'hidden-'.bin2hex(random_bytes(12));

        $auth = json_decode($this->pusher->authorizePresenceChannel($channel, $socketId, $memberId, $info), true);

        // O SDK devolve uma string JSON; se um dia vier algo que não decodifica,
        // responde erro em vez de um `null` que o client do Pusher não entende.
        if (! is_array($auth)) {
            return new EmptyResponse(500);
        }

        return new JsonResponse($auth);
    }
}
