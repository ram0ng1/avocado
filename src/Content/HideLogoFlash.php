<?php

declare(strict_types=1);

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

        $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';
    }
}
