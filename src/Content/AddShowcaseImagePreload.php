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

        // Add early hint for critical images
        // This runs VERY early to tell browser to start downloading the image ASAP
        $document->head[] = '<script>if(navigator.sendBeacon){fetch("/api/discussions?sort=-lastPostedAt&page[limit]=5&filter[q]=tag:' . htmlspecialchars((string)$firstTag, ENT_QUOTES, 'UTF-8') . '").then(r=>r.json()).then(d=>{const discussions=d.data||[];if(discussions[0]){const post=discussions[0].relationships?.firstPost?.data;if(post){const src=post.attributes?.contentHtml?.match(/src="([^"]+\\.(gif|png|jpg|jpeg|webp))"/i)?.[1];if(src){const link=document.createElement("link");link.rel="preload";link.as="image";link.href="/api/avocado/optimize-image?url="+encodeURIComponent(src)+"&width=400&height=150&format=webp";document.head.appendChild(link);}}}}).catch(()=>{})}</script>';
    }
}
