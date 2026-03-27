<?php

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

class HideLogoFlash
{
    public function __construct(protected SettingsRepositoryInterface $settings) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (!$this->settings->get('avocado.logo_enabled', false)) return;
        if (!$this->settings->get('avocado.logo_svg')) return;

        // Hide #home-link before the first paint so the forum title text never
        // flashes while the SVG logo is being fetched and inlined by JS.
        $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';
    }
}
