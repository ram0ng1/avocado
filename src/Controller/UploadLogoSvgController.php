<?php

namespace Ramon\Avocado\Controller;

use Flarum\Api\Controller\UploadImageController;
use Intervention\Image\Interfaces\EncodedImageInterface;
use Laminas\Diactoros\Stream;
use Psr\Http\Message\StreamInterface;
use Psr\Http\Message\UploadedFileInterface;

class UploadLogoSvgController extends UploadImageController
{
    protected string $filePathSettingKey = 'avocado.logo_svg';
    protected string $filenamePrefix = 'avocado-logo';
    protected string $fileExtension = 'svg';

    protected function makeImage(UploadedFileInterface $file): EncodedImageInterface|StreamInterface
    {
        $content = (string) $file->getStream();

        if (!preg_match('/<svg[\s>]/i', $content)) {
            throw new \InvalidArgumentException('The uploaded file must be a valid SVG.');
        }

        $resource = fopen('php://temp', 'r+');
        fwrite($resource, $content);
        rewind($resource);

        return new Stream($resource);
    }
}
