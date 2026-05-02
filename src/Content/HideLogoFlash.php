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
        $avocadoEnabled = (bool) $this->settings->get('avocado.logo_enabled', false);
        $hasSvgLogo     = $avocadoEnabled && !empty(trim((string) ($this->settings->get('avocado.logo_svg') ?? '')));
        $flarumLogoPath = trim((string) ($this->settings->get('logo_path') ?? ''));

        if ($avocadoEnabled) {
            // Set the data-attribute so html[data-avocado-logo-custom="true"] CSS rules
            // activate from the very first frame — before async CSS finishes loading.
            $document->head[] = '<script>document.documentElement.dataset.avocadoLogoCustom="true"</script>';
        }

        if ($hasSvgLogo) {
            // SVG logo: hide until JS fetches, crops via getBBox, injects, then reveals.
            $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';
        } elseif (!$avocadoEnabled && $flarumLogoPath !== '') {
            // Flarum default logo image: hide until the <img> fires its load event.
            // Without this the image appears at its natural (oversized) dimensions
            // for the duration of the first network fetch, then jumps to the CSS size.
            $document->head[] = '<style id="avocado-logo-hide">#home-link{visibility:hidden!important}</style>';
        }
    }
}
