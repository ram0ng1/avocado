<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Discussion\Discussion;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Avocado\Model\Bookmark;

/**
 * Remove o bookmark do ator para uma discussão. O delete é escopado ao próprio
 * user_id (§7), então um ator nunca apaga o bookmark de outro. Idempotente:
 * remover algo já removido devolve `bookmarked: false` sem erro.
 */
class DeleteBookmarkController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $body = (array) ($request->getParsedBody() ?? []);
        $rawId = Arr::get($body, 'discussionId', Arr::get($request->getQueryParams(), 'discussionId'));

        $discussionId = filter_var($rawId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($discussionId === false) {
            throw new ValidationException(['discussionId' => 'Invalid discussion id.']);
        }

        // Não precisa de whereVisibleTo aqui: só apagamos uma linha que pertence
        // ao próprio ator. Se a discussão sumiu/ficou privada, remover o bookmark
        // órfão continua sendo a ação correta.
        Bookmark::query()
            ->where('user_id', (int) $actor->id)
            ->where('discussion_id', $discussionId)
            ->delete();

        return new JsonResponse([
            'discussionId' => (string) $discussionId,
            'bookmarked'   => false,
        ]);
    }
}
