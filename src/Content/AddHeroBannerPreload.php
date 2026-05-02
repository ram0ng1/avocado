<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Foundation\Config;
use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

class AddHeroBannerPreload
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected Config $config,
    ) {}

    /**
     * Validates asset path to prevent directory traversal attacks.
     * Removes ../ and \.\ sequences.
     */
    private function validateAssetPath(string $path): ?string
    {
        // Block path traversal patterns
        if (preg_match('/(\.\.\/|\.\.\\\\|^\.\.+$)/', $path)) {
            return null;
        }

        // Normalize slashes
        $normalized = str_replace('\\', '/', $path);

        // Remove leading slashes
        $normalized = ltrim($normalized, '/');

        return $normalized;
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $heroImage = trim((string) $this->settings->get('avocado.hero_image'));

        if (!$heroImage) return;

        $heroUrl = preg_match('/^https?:\/\//', $heroImage)
            ? $heroImage
            : rtrim((string) $this->config->url(), '/') . '/assets/' . $this->validateAssetPath($heroImage);

        if (!$heroUrl || str_ends_with($heroUrl, '/assets/')) {
            return;
        }

        // Validate that URL is a valid absolute or relative URL
        if (!preg_match('/^(https?:\/\/|\/)/', $heroUrl)) {
            return;
        }

        $escapedUrl = htmlspecialchars($heroUrl, ENT_QUOTES, 'UTF-8');

        // Only output if escapedUrl is not empty
        if (empty($escapedUrl)) {
            return;
        }

        // imagesizes tells the browser which rendered size to expect so it can
        // pick the right source from imagesrcset (or just prioritise the single src).
        $document->head[] = '<link rel="preload" as="image" href="' . $escapedUrl . '" fetchpriority="high" imagesizes="100vw">';
    }
}
