<?php

declare(strict_types=1);

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

    #[\Override]
    protected function makeImage(UploadedFileInterface $file): EncodedImageInterface|StreamInterface
    {
        $sanitized = $this->sanitizeSvg((string) $file->getStream());

        $resource = fopen('php://temp', 'r+');
        fwrite($resource, $sanitized);
        rewind($resource);

        return new Stream($resource);
    }

    private function sanitizeSvg(string $content): string
    {
        $prev = libxml_use_internal_errors(true);

        $dom = new \DOMDocument();
        if (!$dom->loadXML($content, LIBXML_NONET | LIBXML_NOBLANKS)) {
            libxml_use_internal_errors($prev);
            throw new \InvalidArgumentException('Invalid SVG: could not parse XML.');
        }

        libxml_use_internal_errors($prev);

        $root = $dom->documentElement;
        if (!$root || strtolower($root->localName) !== 'svg') {
            throw new \InvalidArgumentException('The uploaded file must be a valid SVG.');
        }

        $this->cleanNode($root);

        return (string) $dom->saveXML($root);
    }

    /** @param \DOMNode $node */
    private function cleanNode(\DOMNode $node): void
    {
        static $dangerous = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'base', 'link'];

        $children = iterator_to_array($node->childNodes);

        foreach ($children as $child) {
            if ($child instanceof \DOMElement) {
                if (in_array(strtolower($child->localName), $dangerous, true)) {
                    $node->removeChild($child);
                    continue;
                }
                $this->cleanNode($child);
            } elseif ($child instanceof \DOMProcessingInstruction) {
                $node->removeChild($child);
            }
        }

        if (!($node instanceof \DOMElement)) {
            return;
        }

        $remove = [];

        foreach ($node->attributes as $attr) {
            $name = strtolower($attr->name);
            $val  = ltrim($attr->value);

            if (str_starts_with($name, 'on')) {
                $remove[] = $attr->name;
                continue;
            }

            if (preg_match('/^javascript\s*:/i', $val)) {
                $remove[] = $attr->name;
                continue;
            }

            if (in_array($name, ['href', 'xlink:href', 'src', 'action'], true)
                && preg_match('/^data\s*:/i', $val)) {
                $remove[] = $attr->name;
            }
        }

        foreach ($remove as $attrName) {
            $node->removeAttribute($attrName);
        }
    }
}
