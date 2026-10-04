<?php

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
 * Ícone que substitui o favicon no rótulo de link interno (`[ícone] #123`).
 *
 * Passa pelo SvgIconSanitizer (allowlist, o mesmo dos ícones de tag) e não pelo
 * sanitizador do logo: é um ícone de uma cor, desenhado como máscara, e o
 * arquivo fica servido no domínio do fórum — aberto direto pela URL, um SVG com
 * script rodaria aqui.
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
