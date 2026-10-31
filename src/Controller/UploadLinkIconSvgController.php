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
use Laminas\Diactoros\Stream;
use Psr\Http\Message\StreamInterface;
use Psr\Http\Message\UploadedFileInterface;
use Ramon\Avocado\Support\SvgIconSanitizer;

/**
 * Ícone do rótulo de link interno. Usa o SvgIconSanitizer (allowlist): o
 * arquivo é servido no domínio do fórum, e aberto pela URL um SVG com script rodaria.
 */
class UploadLinkIconSvgController extends UploadImageController
{
    protected string $filePathSettingKey = 'avocado.link_icon_svg';
    protected string $filenamePrefix = 'avocado-link-icon';
    protected string $fileExtension = 'svg';

    #[\Override]
    protected function makeImage(UploadedFileInterface $file): EncodedImageInterface|StreamInterface
    {
        $sanitized = SvgIconSanitizer::sanitize((string) $file->getStream());

        if ($sanitized === null) {
            throw new ValidationException([
                $this->filenamePrefix => $this->translator->trans('ramon-avocado.api.svg_invalid'),
            ]);
        }

        $stream = new Stream('php://temp', 'r+');
        $stream->write($sanitized);
        $stream->rewind();

        return $stream;
    }
}
