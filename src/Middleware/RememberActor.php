<?php

declare(strict_types=1);

namespace Ramon\Avocado\Middleware;

use Flarum\Http\RequestUtil;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Avocado\Support\SupportEvents;

/**
 * Guarda o ator do request da API para os ganchos de modelo que não recebem
 * request nenhum — hoje, a linha do tempo dos tickets do support. Entra depois
 * dos middlewares de autenticação do core, então o ator já está resolvido.
 */
class RememberActor implements MiddlewareInterface
{
    #[\Override]
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        SupportEvents::rememberActor($actor->isGuest() ? null : (int) $actor->id);

        return $handler->handle($request);
    }
}
