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
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Flarum\Locale\TranslatorInterface;
use Flarum\User\Exception\PermissionDeniedException;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Avocado\Model\Bookmark;
use Ramon\Avocado\Support\BookmarksSetting;

/**
 * O delete é escopado ao user_id do ator, então ninguém apaga o bookmark de
 * outro. Idempotente: remover de novo devolve `bookmarked: false`.
 */
class DeleteBookmarkController implements RequestHandlerInterface
{
    public function __construct(
        protected BookmarksSetting $bookmarks,
        protected TranslatorInterface $translator,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        if (! $this->bookmarks->enabled()) {
            throw new PermissionDeniedException();
        }

        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $body = (array) ($request->getParsedBody() ?? []);
        $rawId = Arr::get($body, 'discussionId', Arr::get($request->getQueryParams(), 'discussionId'));

        $discussionId = filter_var($rawId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($discussionId === false) {
            throw new ValidationException(['discussionId' => $this->translator->trans('ramon-avocado.api.invalid_discussion_id')]);
        }

        // Sem whereVisibleTo: a linha é do próprio ator, e remover o bookmark de uma
        // discussão que ficou privada continua correto.
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
