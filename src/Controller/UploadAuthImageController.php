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

use Flarum\Api\Controller\UploadImageController;
use Flarum\Foundation\ValidationException;
use Intervention\Image\Interfaces\EncodedImageInterface;
use Psr\Http\Message\UploadedFileInterface;

class UploadAuthImageController extends UploadImageController
{
    protected string $filePathSettingKey = 'avocado.auth_image';
    protected string $filenamePrefix = 'avocado-auth';
    protected string $fileExtension = 'webp';

    private const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

    #[\Override]
    protected function makeImage(UploadedFileInterface $file): EncodedImageInterface
    {
        // Recusa antes de o Intervention decodificar o bitmap (OOM/DoS).
        $size = $file->getSize();
        if ($size === null || $size > self::MAX_UPLOAD_BYTES) {
            throw new ValidationException([
                $this->filenamePrefix => $this->translator->trans('ramon-avocado.api.file_too_large', ['max' => '8 MB']),
            ]);
        }

        // getMetadata('uri') é null num stream sem arquivo: erro de validação em vez de TypeError.
        $uri = $file->getStream()->getMetadata('uri');
        if (! is_string($uri) || ! is_readable($uri)) {
            throw new ValidationException(['avatar' => $this->translator->trans('ramon-avocado.api.file_not_readable')]);
        }

        return $this->imageManager->read($uri)
            ->scaleDown(width: 900)
            ->toWebp(quality: 80);
    }
}
