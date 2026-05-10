<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Discussion\Discussion;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Illuminate\Contracts\Filesystem\Factory;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Intervention\Image\ImageManager;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class UploadDiscussionHeroController implements RequestHandlerInterface
{
    protected Filesystem $uploadDir;

    public function __construct(
        protected ImageManager $imageManager,
        Factory $filesystemFactory,
    ) {
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

        $file = Arr::get($request->getUploadedFiles(), 'avocado-discussion-hero');
        if (! $file) {
            throw new ValidationException(['file' => 'No file uploaded.']);
        }

        $encoded = $this->imageManager
            ->read($file->getStream()->getMetadata('uri'))
            ->scaleDown(width: 1600)
            ->toWebp(quality: 78);

        // Replace any previous image attached to this discussion.
        $oldPath = $discussion->avocado_hero_image_path;
        if ($oldPath && $this->uploadDir->exists($oldPath)) {
            $this->uploadDir->delete($oldPath);
        }

        $filename = 'avocado-disc-hero-'.$discussion->id.'-'.Str::lower(Str::random(8)).'.webp';
        $this->uploadDir->put($filename, $encoded);

        $discussion->avocado_hero_image_path = $filename;
        $discussion->save();

        return new JsonResponse([
            'discussionId'   => (string) $discussion->id,
            'heroImagePath'  => $filename,
            'heroImageUrl'   => $this->uploadDir->url($filename),
        ]);
    }
}
