<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Injects a script into <head> that ensures Font Awesome Kit processes
 * dynamically-added .fa-kit elements without page refresh.
 *
 * How it works:
 * 1. Font Awesome Kit's main script loads and sets up mutation observation
 * 2. This script configures FontAwesome to watch the DOM for new .fa-kit icons
 * 3. When Mithril renders new elements with .fa-kit, FontAwesome automatically
 *    processes them without flash or delay
 *
 * This prevents the "refresh" effect where icons flicker or are redrawn.
 */
class LoadFontAwesomeKit
{
    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
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
