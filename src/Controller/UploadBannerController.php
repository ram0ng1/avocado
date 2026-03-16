<?php

namespace Ramon\Avocado\Controller;

use Flarum\Api\Controller\UploadImageController;
use Intervention\Image\Interfaces\EncodedImageInterface;
use Psr\Http\Message\UploadedFileInterface;

class UploadBannerController extends UploadImageController
{
    protected string $filePathSettingKey = 'avocado.hero_image';
    protected string $filenamePrefix = 'avocado-banner';
    protected string $fileExtension = 'webp';

    protected function makeImage(UploadedFileInterface $file): EncodedImageInterface
    {
        return $this->imageManager->read($file->getStream()->getMetadata('uri'))
            ->scaleDown(width: 1400)
            ->toWebp(quality: 75);
    }
}
