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

namespace Ramon\Avocado\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Headers seguros de pôr sempre, para hosts onde não dá para mexer no servidor
 * web. `Vary: Cookie` impede um proxy de servir a página de um usuário logado a
 * um anônimo. Cache-Control fica de fora: o HTML carrega estado da sessão.
 */
class AddPerfHeaders implements MiddlewareInterface
{
    #[\Override]
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);

        $vary = trim($response->getHeaderLine('Vary'));
        $hasAcceptEncoding = $vary !== '' && stripos($vary, 'accept-encoding') !== false;
        $hasCookie         = $vary !== '' && stripos($vary, 'cookie')          !== false;

        $parts = $vary === '' ? [] : array_map('trim', explode(',', $vary));
        if (! $hasAcceptEncoding) { $parts[] = 'Accept-Encoding'; }
        if (! $hasCookie)         { $parts[] = 'Cookie'; }

        return $response
            ->withHeader('Vary', implode(', ', array_filter($parts)))
            ->withHeader('X-Content-Type-Options', 'nosniff')
            // Só sobrescreve X-Frame-Options se ainda não foi setado por outra extensão.
            ->withHeader(
                'X-Frame-Options',
                $response->getHeaderLine('X-Frame-Options') ?: 'SAMEORIGIN'
            );
    }
}
