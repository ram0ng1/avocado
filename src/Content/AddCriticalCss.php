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
        $fontBase = $baseUrl . '/assets/fonts/';

        $normalFont = htmlspecialchars($fontBase . 'dm-sans-variable.woff2', ENT_QUOTES, 'UTF-8');
        $italicFont = htmlspecialchars($fontBase . 'dm-sans-italic.woff2', ENT_QUOTES, 'UTF-8');

        // ── Logo size reservation ─────────────────────────────────────────────
        // The theme's main CSS gates logo constraints behind
        //   html[data-avocado-logo-custom="true"] { … }
        // That attribute is set by JS, which runs AFTER the first paint.
        // Because both core and extension CSS are loaded asynchronously, the
        // logo renders unstyled (full/natural size) until CSS arrives → visible
        // flicker / jump (the Flarum v2 async-stylesheet issue).
        //
        // Fix: replicate the logo constraints here, without the JS attribute
        // selector, so they apply from the very first rendered frame.
        $logoEnabled = (bool) $this->settings->get('avocado.logo_enabled', false);
        $logoSvg     = trim((string) ($this->settings->get('avocado.logo_svg') ?? ''));
        $hasSvgLogo  = $logoEnabled && $logoSvg !== '';

        if ($hasSvgLogo) {
            // SVG logo — JS will set explicit width/height from the viewBox, but
            // we reserve 50 px height immediately so the header doesn't shift.
            $logoReservation = 'svg.Header-logo,svg.AvocadoLogoSvg{height:50px;width:auto;max-width:none;max-height:none;display:inline-block;vertical-align:middle;flex-shrink:0;overflow:visible}';
        } elseif ($logoEnabled) {
            // Admin-uploaded PNG / fallback image logo.
            $logoReservation = 'img.Header-logo{height:35px;width:auto;max-width:200px;display:inline-block;vertical-align:middle}';
        } else {
            // No custom logo — mirror Flarum core default so any admin-uploaded
            // image or forum-name heading is constrained before the main CSS loads.
            $logoReservation = '.Header-logo{max-height:30px;display:block}';
        }

        // ── Header title flex alignment (custom logo only) ────────────────────
        // App.less gates this behind html[data-avocado-logo-custom="true"] which is
        // set by HideLogoFlash.php's inline <script>. That script runs before any
        // render, so the attribute IS present at first paint — but the main CSS
        // that targets it is async and arrives later. We replicate those rules here
        // so the title flex layout is correct from the very first frame.
        $logoTitleCss = $logoEnabled
            ? '.App-header .Header-title{display:flex!important;align-items:center!important;padding:5px 0}' .
              '#home-link.Header-logo{display:flex;align-items:center;justify-content:center;min-height:50px}'
            : '';

        // ── Hero image size reservation ───────────────────────────────────────
        // Reserve vertical space for the hero banner so CLS is zero.
        $hasHero = !empty(trim((string) $this->settings->get('avocado.hero_image')));
        $heroReservation = $hasHero
            ? '.Hero--banner{min-height:400px}@media(max-width:767px){.Hero--banner{min-height:280px}}'
            : '';

        // ── Showcase grid mobile layout ───────────────────────────────────────
        // On mobile the showcase grid is a horizontal scroll carousel (display:flex,
        // overflow-x:auto). Before async CSS loads it renders as a plain block div
        // and cards stack vertically, then jump to horizontal — same flash as the nav.
        // Mirror the @phone rules from HomePage.less immediately.
        $showcaseEnabled = (bool) $this->settings->get('avocado.showcase_enabled', false);
        $showcaseCss = $showcaseEnabled
            ? '@media(max-width:767px){' .
                '.AvocadoHome-showcaseGrid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:10px;padding-bottom:6px;scrollbar-width:none}' .
                '.AvocadoHome-showcaseCard{flex:0 0 72vw;max-width:240px;scroll-snap-align:start;height:auto}' .
              '}'
            : '';

        // ── Mobile nav controls ───────────────────────────────────────────────
        // .AvocadoNav-helper wraps the IndexSidebar that provides the phone-header
        // dropdown nav. Before the main CSS loads it renders as a visible block
        // in the page content — the same async-stylesheet flash that affects the
        // logo. We hide it immediately and ensure the absolutely-positioned phone
        // controls (.App-primaryControl, .App-titleControl, .App-backControl) are
        // placed correctly from the first frame so they never "jump" into view.
        // Breakpoints mirror Flarum core: @phone ≤ 767 px, @tablet-up ≥ 768 px.
        $mobileNavCss =
            // Collapse the nav helper on all viewports so it is invisible before
            // main CSS arrives. On tablet+ the main CSS adds display:none later.
            '.AvocadoNav-helper{height:0;overflow:hidden}' .
            '@media(max-width:767px){' .
                // Mirror Flarum core App.less phone rules so controls are
                // positioned BEFORE forum.css / ramon-avocado.css arrive.
                '.App-primaryControl,.App-titleControl,.App-backControl{' .
                    'position:absolute!important;top:0!important;margin:0;' .
                    'z-index:1001}' .
                '.App-titleControl{width:200px;left:50%;margin-left:-100px;text-align:center}' .
                '.App-primaryControl{right:0}' .
                '.App-backControl{left:0}' .
            '}';

        $css = <<<CSS
        @font-face{font-family:'DM Sans Variable';font-weight:100 900;font-style:normal;font-display:swap;src:url('{$normalFont}') format('woff2-variations')}
        @font-face{font-family:'DM Sans Variable';font-weight:100 900;font-style:italic;font-display:swap;src:url('{$italicFont}') format('woff2-variations')}
        @font-face{font-family:'DM Sans';font-weight:100 900;font-style:normal;font-display:swap;src:url('{$normalFont}') format('woff2-variations')}
        body{font-family:'DM Sans Variable','DM Sans','Segoe UI',sans-serif;overflow-x:hidden}
        .App-header{display:flex;height:52px;min-height:52px;contain:layout}
        {$logoReservation}
        {$logoTitleCss}
        {$mobileNavCss}
        {$heroReservation}
        {$showcaseCss}
        CSS;

        // Strip extra whitespace/newlines introduced by heredoc indentation
        $css = preg_replace('/\s*\n\s*/', '', trim($css));

        $document->head[] = '<style id="avocado-critical">' . $css . '</style>';
    }
}
