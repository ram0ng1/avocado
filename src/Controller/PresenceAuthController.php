<?php

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
 * Autoriza o presence channel `presence-avocado-discussion={id}` ("quem está
 * lendo agora"). A rota só existe quando flarum/realtime está ativo (extend.php
 * condiciona o registro), então o singleton Pusher do provider dele está
 * garantido no container. Guests não entram (presence exige user id) e a
 * discussão precisa ser visível ao ator (§5). Quem desativou discloseOnline
 * entra com payload `hidden` — vê os demais, mas não é listado nem contado.
 * O CSRF NÃO é isento aqui: o client manda X-CSRF-Token no auth (§16).
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

        $auth = $this->pusher->authorizePresenceChannel($channel, $socketId, (string) $actor->id, $info);

        return new JsonResponse(json_decode($auth, true));
    }
}
