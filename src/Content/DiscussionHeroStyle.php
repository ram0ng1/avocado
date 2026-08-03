<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Publishes the admin's discussion-hero choice on <html> before the first paint.
 *
 * less/forum/DiscussionHeroEditorial.less keys off
 * html[data-avocado-disc-hero="editorial"]. Setting the attribute from the
 * forum bundle instead would land one frame late: the default hero (tall band,
 * tag-colour wash, display-scale title) would paint first and then collapse
 * into the editorial one — the same data flash the logo and the spinner already
 * avoid this way (see HideLogoFlash, CustomLoadingSpinner).
 *
 * Only the non-default value is written. A forum on the default hero gets no
 * attribute and no inline script at all.
 */
class DiscussionHeroStyle
{
    public function __construct(protected SettingsRepositoryInterface $settings) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $style = (string) ($this->settings->get('avocado.discussion_hero_style') ?? 'default');

        if ($style !== 'editorial') {
            return;
        }

        $document->head[] = '<script>document.documentElement.dataset.avocadoDiscHero="editorial"</script>';
    }
}
