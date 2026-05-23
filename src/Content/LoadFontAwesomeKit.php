<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Injects a preconnect to the Font Awesome Kit CDN plus the FontAwesomeConfig
 * stanza that switches the kit's runtime into mutation-observer mode (so
 * Mithril-added .fa-kit icons render without a refresh flash).
 *
 * Both lines are no-ops — and a wasted preconnect — on forums that don't load
 * a kit at all, so the injector is gated behind an admin opt-in. The Kit
 * script itself is expected to be loaded by whoever opts in (typically pasted
 * into the admin custom_header HTML field straight from the FA dashboard).
 */
class LoadFontAwesomeKit
{
    public function __construct(protected SettingsRepositoryInterface $settings)
    {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (! $this->settings->get('avocado.fontawesome_kit_enabled', false)) {
            return;
        }

        // language=JavaScript
        $script = <<<'JS'
<link rel="preconnect" href="https://kit.fontawesome.com" crossorigin>
<link rel="preconnect" href="https://ka-f.fontawesome.com" crossorigin>
<script>
window.FontAwesomeConfig = {
  autoReplaceSvg: true,
  observeMutations: true,
  mutationObserverOptions: { childList: true, subtree: true }
};
</script>
JS;

        $document->head[] = $script;
    }
}
