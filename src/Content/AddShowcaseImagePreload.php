<?php

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;

/**
 * AddShowcaseImagePreload
 * 
 * Adds preload hints for showcase images to improve LCP
 * This injector adds link rel="preload" tags for the first showcase images
 */
class AddShowcaseImagePreload
{
    /**
     * @param SettingsRepositoryInterface $settings
     */
    public function __construct(private SettingsRepositoryInterface $settings)
    {
    }

    /**
     * Inject preload hints into document head
     */
    public function __invoke(Document $document): void
    {
        $showcaseTag = $this->settings->get('avocado.showcase_tag');

        if (!$showcaseTag) {
            return;
        }

        // Parse showcase_tag if it's JSON array format
        $tags = $showcaseTag;
        if (is_string($tags)) {
            $decoded = json_decode($tags, true);
            $tags = is_array($decoded) ? $decoded : [$tags];
        }

        if (empty($tags) || !is_array($tags)) {
            return;
        }

        // Get first tag safely
        $firstTag = reset($tags);
        if (!$firstTag) {
            return;
        }

        // Add preload hints for image formats
        // The first showcase image is the LCP candidate
        $preloadLinks = [
            // Preload the optimization API endpoint (it's tiny)
            '<link rel="preconnect" href="/api/avocado/optimize-image">',
            
            // DNS prefetch for CDN (if using external CDN)
            '<link rel="dns-prefetch" href="https://cdn.ramonguilherme.com.br">',
            
            // Prefetch connect to CDN
            '<link rel="preconnect" href="https://cdn.ramonguilherme.com.br" crossorigin>',
        ];

        // Inject preload hints into head
        foreach ($preloadLinks as $link) {
            $document->head[] = $link;
        }
    }
}
