<?php

namespace Ramon\Avocado\Middleware;

use Laminas\Diactoros\Stream;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

class RemoveSkipLink implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);

        if (!str_contains($response->getHeaderLine('Content-Type'), 'text/html')) {
            return $response;
        }

        $body = (string) $response->getBody();

        $cleaned = preg_replace(
            '/<a\b[^>]*\bclass="sr-only sr-only-focusable-custom"[^>]*>.*?<\/a>/s',
            '',
            $body
        );

        if ($cleaned === $body) {
            return $response;
        }

        $stream = new Stream('php://temp', 'r+');
        $stream->write($cleaned);
        $stream->rewind();

        return $response
            ->withBody($stream)
            ->withHeader('Content-Length', (string) strlen($cleaned));
    }
}
