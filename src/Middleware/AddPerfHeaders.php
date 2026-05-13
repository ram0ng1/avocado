<?php

declare(strict_types=1);

namespace Ramon\Avocado\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Headers de performance e segurança que valem aplicar do lado da aplicação,
 * mesmo quando o operador do host esqueceu de configurar (ou está num shared
 * hosting onde não tem como mexer no nginx/apache).
 *
 * Cobre só o que é seguro adicionar incondicionalmente:
 *
 * - `Vary: Accept-Encoding, Cookie` — garante que CDNs/reverse proxies
 *   diferenciem corretamente a resposta comprimida vs não-comprimida e
 *   nunca sirvam a página de um usuário logado para um anônimo.
 *
 * - `X-Content-Type-Options: nosniff` — impede o browser de adivinhar o
 *   MIME type (mitiga XSS via type confusion em uploads).
 *
 * - `X-Frame-Options: SAMEORIGIN` — proteção básica contra clickjacking.
 *
 * Cache-Control NÃO é setado aqui: as respostas HTML do Flarum carregam
 * state do usuário (CSRF token, payload da sessão), então cachear no proxy
 * sem `private`+gating por cookie quebra UX. Deixe para o operador definir
 * via nginx/apache se quiser cache anônimo agressivo.
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
