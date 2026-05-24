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
use Ramon\Avocado\Model\DiscussionHero;

class UploadDiscussionHeroController implements RequestHandlerInterface
{
    protected Filesystem $uploadDir;

    public function __construct(
        protected ImageManager $imageManager,
        Factory $filesystemFactory,
    ) {
        $this->uploadDir = $filesystemFactory->disk('flarum-assets');
    }

    /** Hero source images larger than this are rejected before the decoder runs. */
    private const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

    /** MIME types accepted as hero-image source uploads. */
    private const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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

        // Use a dedicated ability so the authorization rule is named for what
        // it gates (hero-image upload) rather than piggy-backing on the
        // unrelated "rename" permission. The policy currently delegates to
        // rename — admins can override that later without touching this
        // controller. See Ramon\Avocado\Access\DiscussionPolicy.
        $actor->assertCan('uploadHeroImage', $discussion);

        $file = Arr::get($request->getUploadedFiles(), 'avocado-discussion-hero');
        if (! $file) {
            throw new ValidationException(['file' => 'No file uploaded.']);
        }

        // Size guard: hero source images are never multi-megabyte; reject before
        // Intervention attempts to decode the bitmap into memory (OOM/DoS).
        $size = $file->getSize();
        if ($size === null || $size > self::MAX_UPLOAD_BYTES) {
            throw new ValidationException(['file' => 'File is too large (max 8 MB).']);
        }

        // MIME guard: don't trust the client's Content-Type. Sniff on disk via
        // finfo — mime_content_type() is a thin wrapper over the same database
        // but is deprecated for new code and unavailable on PHP builds compiled
        // without ext-fileinfo's CLI alias. Use the finfo API directly.
        $tmpPath = $file->getStream()->getMetadata('uri');
        $mime = '';
        if (is_string($tmpPath) && is_readable($tmpPath)) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo !== false) {
                $detected = finfo_file($finfo, $tmpPath);
                finfo_close($finfo);
                if (is_string($detected)) {
                    $mime = $detected;
                }
            }
        }
        if (! in_array($mime, self::ALLOWED_MIMES, true)) {
            throw new ValidationException(['file' => 'Unsupported image type.']);
        }

        $encoded = $this->imageManager
            ->read($tmpPath)
            ->scaleDown(width: 1600)
            ->toWebp(quality: 78);

        /** @var DiscussionHero|null $hero */
        $hero = $discussion->avocadoHero;

        // Substitui qualquer imagem anterior anexada a esta discussão.
        if ($hero && $this->uploadDir->exists($hero->image_path)) {
            $this->uploadDir->delete($hero->image_path);
        }

        $filename = 'avocado-disc-hero-'.$discussion->id.'-'.Str::lower(Str::random(8)).'.webp';
        $this->uploadDir->put($filename, $encoded);

        if ($hero === null) {
            $hero = new DiscussionHero();
            $hero->discussion_id = (int) $discussion->id;
        }
        $hero->image_path = $filename;
        $hero->save();

        return new JsonResponse([
            'discussionId'   => (string) $discussion->id,
            'heroImagePath'  => $filename,
            'heroImageUrl'   => $this->uploadDir->url($filename),
        ]);
    }
}
