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
use Ramon\Avocado\Model\DiscussionHero;

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

        $rawId = Arr::get($request->getQueryParams(), 'discussionId');
        $discussionId = filter_var($rawId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($discussionId === false) {
            throw new ValidationException(['discussionId' => 'Invalid discussion id.']);
        }

        /** @var Discussion|null $discussion */
        $discussion = Discussion::query()->find($discussionId);
        if (! $discussion) {
            throw new ValidationException(['discussionId' => 'Discussion not found.']);
        }

        // Usa a ability dedicada (mesma do upload) em vez de pegar carona em
        // `rename`. A política delega para `rename` por enquanto; trocar a
        // semântica via permissão fica numa única decisão do admin.
        $actor->assertCan('uploadHeroImage', $discussion);

        /** @var DiscussionHero|null $hero */
        $hero = $discussion->avocadoHero;
        if ($hero) {
            if ($hero->image_path && $this->uploadDir->exists($hero->image_path)) {
                $this->uploadDir->delete($hero->image_path);
            }
            $hero->delete();
        }

        return new JsonResponse([
            'discussionId'  => (string) $discussion->id,
            'heroImagePath' => null,
            'heroImageUrl'  => null,
        ]);
    }
}
