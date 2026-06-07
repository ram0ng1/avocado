<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Api\Controller\UploadImageController;
use Flarum\Foundation\ValidationException;
use Intervention\Image\Interfaces\EncodedImageInterface;
use Psr\Http\Message\UploadedFileInterface;

class UploadAuthImageController extends UploadImageController
{
    protected string $filePathSettingKey = 'avocado.auth_image';
    protected string $filenamePrefix = 'avocado-auth';
    protected string $fileExtension = 'webp';

    #[\Override]
    protected function makeImage(UploadedFileInterface $file): EncodedImageInterface
    {
        // getMetadata('uri') is null for a non-file-backed stream; reading null
        // would TypeError. Fail with a clean validation error instead.
        $uri = $file->getStream()->getMetadata('uri');
        if (! is_string($uri) || ! is_readable($uri)) {
            throw new ValidationException(['avatar' => 'Uploaded file is not readable.']);
        }

        return $this->imageManager->read($uri)
            ->scaleDown(width: 900)
            ->toWebp(quality: 80);
    }
}
