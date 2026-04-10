<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Foundation\Config;
use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Injects a minimal inline <style> with critical above-the-fold CSS.
 *
 * Goals:
 *  - Font-face declarations so text renders immediately in the correct typeface
 *    even before the main forum.css file finishes loading (eliminates FOUT).
 *  - Body/html resets that prevent CLS from the page background shifting.
 *  - App-header dimensions so the topbar space is reserved from the first frame.
 *
 * Keep this small (< 2 KB). Any style that can wait until forum.css loads
 * should stay there.
 */
class AddCriticalCss
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected Config $config,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $baseUrl  = rtrim((string) $this->config->url(), '/');
        $fontBase = $baseUrl . '/assets/extensions/ramon-avocado/fonts/';

        $normalFont = htmlspecialchars($fontBase . 'dm-sans-variable.woff2', ENT_QUOTES, 'UTF-8');
        $italicFont = htmlspecialchars($fontBase . 'dm-sans-italic.woff2', ENT_QUOTES, 'UTF-8');

        // ── Hero image size reservation ───────────────────────────────────────
        // We know the hero banner is present when a hero_image setting exists.
        // Reserve 400px desktop / 280px mobile so CLS is zero for the hero area.
        $hasHero = !empty(trim((string) $this->settings->get('avocado.hero_image')));
        $heroReservation = $hasHero
            ? '.Hero--banner{min-height:400px}@media(max-width:767px){.Hero--banner{min-height:280px}}'
            : '';

        $css = <<<CSS
        @font-face{font-family:'DM Sans Variable';font-weight:100 900;font-style:normal;font-display:swap;src:url('{$normalFont}') format('woff2-variations')}
        @font-face{font-family:'DM Sans Variable';font-weight:100 900;font-style:italic;font-display:swap;src:url('{$italicFont}') format('woff2-variations')}
        @font-face{font-family:'DM Sans';font-weight:100 900;font-style:normal;font-display:swap;src:url('{$normalFont}') format('woff2-variations')}
        body{font-family:'DM Sans Variable','DM Sans','Segoe UI',sans-serif;overflow-x:hidden}
        .App-header{height:52px;min-height:52px;contain:layout size}
        {$heroReservation}
        CSS;

        // Strip extra whitespace/newlines introduced by heredoc indentation
        $css = preg_replace('/\s*\n\s*/', '', trim($css));

        $document->head[] = '<style id="avocado-critical">' . $css . '</style>';
    }
}
