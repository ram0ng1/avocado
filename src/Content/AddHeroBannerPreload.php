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

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $heroImage = trim((string) $this->settings->get('avocado.hero_image'));

        if (!$heroImage) return;

        $heroUrl = preg_match('/^https?:\/\//', $heroImage)
            ? $heroImage
            : rtrim((string) $this->config->url(), '/') . '/assets/' . $heroImage;

        $escapedUrl = htmlspecialchars($heroUrl, ENT_QUOTES, 'UTF-8');

        $document->head[] = '<link rel="preload" as="image" href="' . $escapedUrl . '" fetchpriority="high">';
    }
}
