<?php

namespace Ramon\Avocado\Controller;

use Flarum\Api\Controller\UploadImageController;
use Intervention\Image\Interfaces\EncodedImageInterface;
use Psr\Http\Message\UploadedFileInterface;

class UploadAuthImageController extends UploadImageController
{
    protected string $filePathSettingKey = 'avocado.auth_image';
    protected string $filenamePrefix = 'avocado-auth';
    protected string $fileExtension = 'webp';

    protected function makeImage(UploadedFileInterface $file): EncodedImageInterface
    {
        return $this->imageManager->read($file->getStream()->getMetadata('uri'))
            ->scaleDown(width: 900)
            ->toWebp(quality: 80);
    }
}
