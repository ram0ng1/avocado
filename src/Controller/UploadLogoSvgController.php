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

        // Laminas\Diactoros\Stream abre o resource php://temp internamente; o
        // SDK trata write/rewind sem precisarmos de fopen/fwrite/rewind crus.
        $stream = new Stream('php://temp', 'r+');
        $stream->write($sanitized);
        $stream->rewind();

        return $stream;
    }

    private function sanitizeSvg(string $content): string
    {
        // Reject DOCTYPE / ENTITY declarations before parsing — defeats XXE,
        // billion-laughs, and external-DTD attacks even though LIBXML_NONET
        // would block the network fetch, the parser still expands local
        // entities in memory.
        if (preg_match('/<!DOCTYPE|<!ENTITY/i', $content)) {
            throw new \InvalidArgumentException('SVG contains forbidden DOCTYPE or ENTITY declaration.');
        }

        $prev = libxml_use_internal_errors(true);

        // LIBXML_NONET blocks network DTD fetches; LIBXML_NOENT is intentionally
        // NOT set (despite its name, it ENABLES entity substitution and would
        // re-introduce billion-laughs-style expansion if the pre-parse regex is
        // ever bypassed).
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
        // SMIL animation tags (animate/animateTransform/animateMotion/set) can
        // mutate attribute values at runtime — including href on a parent <a>,
        // which becomes a delayed-trigger XSS. <style> can carry @import and
        // expression() payloads. <a> is dropped because SVG anchors can carry
        // javascript:/data:text/html href values that survive attribute scrub
        // edge cases. <use> with an external href is SSRF-adjacent (fetches
        // remote SVG referencing this DOM).
        static $dangerous = [
            'script', 'foreignobject', 'iframe', 'object', 'embed', 'base', 'link',
            'style', 'a', 'animate', 'animatetransform', 'animatemotion', 'set',
        ];

        $children = iterator_to_array($node->childNodes);

        foreach ($children as $child) {
            if ($child instanceof \DOMElement) {
                $localName = strtolower($child->localName);
                if (in_array($localName, $dangerous, true)) {
                    $node->removeChild($child);
                    continue;
                }
                if ($localName === 'use' && $this->useHasExternalHref($child)) {
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

            if (preg_match('/^(?:javascript|vbscript)\s*:/i', $val)) {
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

    private function useHasExternalHref(\DOMElement $el): bool
    {
        foreach (['href', 'xlink:href'] as $attr) {
            $val = ltrim((string) $el->getAttribute($attr));
            if ($val === '') {
                continue;
            }
            // Only same-document fragment refs (#id) are safe.
            if ($val[0] !== '#') {
                return true;
            }
        }
        return false;
    }
}
