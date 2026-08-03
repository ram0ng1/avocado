<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Publishes the admin's discussion-style choice on <html> before the first paint.
 *
 * less/forum/DiscussionEditorial.less keys off
 * html[data-avocado-disc-style="editorial"]. Setting the attribute from the
 * forum bundle instead would land one frame late: the default page (tall hero
 * washed in the tag colour, no conversation spine) would paint first and then
 * rearrange — the same data flash the logo and the spinner already avoid this
 * way (see HideLogoFlash, CustomLoadingSpinner).
 *
 * Only the non-default value is written. A forum on the default style gets no
 * attribute and no inline script at all.
 */
class DiscussionStyle
{
    public function __construct(protected SettingsRepositoryInterface $settings) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $style = (string) ($this->settings->get('avocado.discussion_style') ?? 'default');

        if ($style !== 'editorial') {
            return;
        }

        $document->head[] = '<script>document.documentElement.dataset.avocadoDiscStyle="editorial"</script>';
    }
}
