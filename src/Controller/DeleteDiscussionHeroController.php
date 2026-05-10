<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Discussion\Discussion;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Illuminate\Contracts\Filesystem\Factory;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class DeleteDiscussionHeroController implements RequestHandlerInterface
{
    protected Filesystem $uploadDir;

    public function __construct(Factory $filesystemFactory)
    {
        $this->uploadDir = $filesystemFactory->disk('flarum-assets');
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $discussionId = (string) Arr::get($request->getQueryParams(), 'discussionId', '');
        $discussionId = preg_replace('/[^0-9]/', '', $discussionId);
        if ($discussionId === '') {
            throw new ValidationException(['discussionId' => 'Invalid discussion id.']);
        }

        /** @var Discussion|null $discussion */
        $discussion = Discussion::query()->find((int) $discussionId);
        if (! $discussion) {
            throw new ValidationException(['discussionId' => 'Discussion not found.']);
        }

        $actor->assertCan('rename', $discussion);

        $path = $discussion->avocado_hero_image_path;
        if ($path && $this->uploadDir->exists($path)) {
            $this->uploadDir->delete($path);
        }

        $discussion->avocado_hero_image_path = null;
        $discussion->save();

        return new JsonResponse([
            'discussionId'  => (string) $discussion->id,
            'heroImagePath' => null,
            'heroImageUrl'  => null,
        ]);
    }
}
