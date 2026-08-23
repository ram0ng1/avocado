<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Api\Controller\UploadImageController;
use Flarum\Foundation\ValidationException;
use Intervention\Image\Interfaces\EncodedImageInterface;
use Psr\Http\Message\UploadedFileInterface;

class UploadBannerController extends UploadImageController
{
    protected string $filePathSettingKey = 'avocado.hero_image';
    protected string $filenamePrefix = 'avocado-banner';
    protected string $fileExtension = 'webp';

    #[\Override]
    protected function makeImage(UploadedFileInterface $file): EncodedImageInterface
    {
        // getMetadata('uri') is null for a non-file-backed stream; reading null
        // would TypeError. Fail with a clean validation error instead.
        $uri = $file->getStream()->getMetadata('uri');
        if (! is_string($uri) || ! is_readable($uri)) {
            throw new ValidationException(['avatar' => $this->translator->trans('ramon-avocado.api.file_not_readable')]);
        }

        return $this->imageManager->read($uri)
            ->scaleDown(width: 1400)
            ->toWebp(quality: 75);
    }
}
