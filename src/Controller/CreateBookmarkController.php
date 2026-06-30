<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Carbon\Carbon;
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
 * Salva uma discussão para o ator. O par é sempre derivado do servidor
 * (user_id = ator, §7) e a discussão precisa ser visível ao ator (§5) — não dá
 * para salvar o que não se pode ver. insertOrIgnore torna o POST idempotente:
 * o índice único absorve cliques repetidos/corridas sem estourar (§62).
 */
class CreateBookmarkController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $discussion = $this->resolveDiscussion($request, $actor);

        Bookmark::query()->insertOrIgnore([
            'user_id'       => (int) $actor->id,
            'discussion_id' => (int) $discussion->id,
            'created_at'    => Carbon::now(),
        ]);

        return new JsonResponse([
            'discussionId' => (string) $discussion->id,
            'bookmarked'   => true,
        ]);
    }

    private function resolveDiscussion(ServerRequestInterface $request, $actor): Discussion
    {
        $body = (array) ($request->getParsedBody() ?? []);
        $rawId = Arr::get($body, 'discussionId', Arr::get($request->getQueryParams(), 'discussionId'));

        $discussionId = filter_var($rawId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($discussionId === false) {
            throw new ValidationException(['discussionId' => 'Invalid discussion id.']);
        }

        /** @var Discussion|null $discussion */
        $discussion = Discussion::whereVisibleTo($actor)->find($discussionId);
        if (! $discussion) {
            throw new ValidationException(['discussionId' => 'Discussion not found.']);
        }

        return $discussion;
    }
}
