<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Publishes the admin's header-search choice on <html> before the first paint.
 *
 * less/forum/App.less gates every rule for the legacy inline search bar behind
 * html[data-avocado-search="v1"]. Flarum 2's own control is a button that core
 * sizes itself (less/common/Search.less), so those rules must never reach it —
 * leaving them ungated is what wrapped the header search button in a fixed
 * 200px box and clipped the active query once 2.0-rc.6 shipped the new markup.
 *
 * The attribute is written from the document rather than from the forum bundle
 * for the same reason as DiscussionStyle: a bundle-set attribute lands one
 * frame late, so the search bar would paint at the wrong size and then snap.
 *
 * Only the non-default value is written. A forum on the V2 search gets no
 * attribute and no inline script at all.
 */
class SearchStyle
{
    public function __construct(protected SettingsRepositoryInterface $settings) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (! (bool) $this->settings->get('avocado.search_v1')) {
            return;
        }

        $document->head[] = '<script>document.documentElement.dataset.avocadoSearch="v1"</script>';
    }
}
