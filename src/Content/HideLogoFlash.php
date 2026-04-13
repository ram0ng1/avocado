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

        // Set the data-attribute for ALL custom logo types (SVG or PNG) so that
        // html[data-avocado-logo-custom="true"] CSS rules in App.less activate
        // from the very first frame — before async CSS finishes loading.
        // This is an inline <script> so it runs synchronously during HTML parsing,
        // before any render occurs.
        $document->head[] = '<script>document.documentElement.dataset.avocadoLogoCustom="true"</script>';

        // For SVG logos: hide #home-link until JS fetches the SVG, crops whitespace
        // via getBBox, injects it, then calls restoreVisibility(). Without this,
        // the old forum-name text or a blank link flashes before the SVG appears.
        if ($this->settings->get('avocado.logo_svg')) {
            $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';
        }
    }
}
