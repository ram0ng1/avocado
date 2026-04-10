<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Foundation\Config;
use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Injects critical resource hints into <head>:
 *
 *  1. <link rel="preload">  — DM Sans variable font (same-origin, every page)
 *  2. <link rel="preconnect"> — derived dynamically from whichever external
 *     origins are configured via the admin panel (hero image, auth image, etc.).
 *     This way no CDN or third-party domain is hard-coded into the theme.
 */
class AddCriticalPreloads
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected Config $config,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $baseUrl  = rtrim((string) $this->config->url(), '/');
        $ownHost  = parse_url($baseUrl, PHP_URL_HOST);

        // ── 1. Font preload ───────────────────────────────────────────────────
        $fontUrl = $baseUrl . '/assets/fonts/dm-sans-variable.woff2';

        $document->head[] = sprintf(
            '<link rel="preload" as="font" type="font/woff2" href="%s" crossorigin="anonymous">',
            htmlspecialchars($fontUrl, ENT_QUOTES, 'UTF-8')
        );

        // ── 2. Preconnect to external image origins ───────────────────────────
        // Collect URLs from every setting that might reference an external image.
        $imageSettings = [
            'avocado.hero_image',
            'avocado.auth_image',
            'avocado.logo_svg',
        ];

        $origins = [];
        foreach ($imageSettings as $key) {
            $value = trim((string) $this->settings->get($key));
            if (!$value) continue;

            // Only process absolute URLs (http/https).
            if (!preg_match('/^https?:\/\//i', $value)) continue;

            $host = parse_url($value, PHP_URL_HOST);
            if (!$host || $host === $ownHost) continue;

            $scheme = parse_url($value, PHP_URL_SCHEME) ?: 'https';
            $origins[$host] = $scheme . '://' . $host;
        }

        foreach ($origins as $origin) {
            $safe = htmlspecialchars($origin, ENT_QUOTES, 'UTF-8');
            // Validate the origin is still a valid URL after escaping
            if (empty($safe) || !preg_match('/^https?:\/\//', $safe)) {
                continue;
            }
            // crossorigin is needed for fonts; for images it is optional but harmless.
            $document->head[] = '<link rel="preconnect" href="' . $safe . '" crossorigin>';
            $document->head[] = '<link rel="dns-prefetch" href="' . $safe . '">';
        }
    }
}
