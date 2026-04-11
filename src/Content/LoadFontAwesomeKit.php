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
<script>
(function() {
  // Wait for Font Awesome Kit to load, then configure it to observe mutations
  // (this ensures .fa-kit icons added after page load are processed immediately)
  function setupFontAwesomeObserver() {
    if (typeof window.FontAwesome === 'undefined' || !window.FontAwesome.config) {
      // Font Awesome not loaded yet, try again soon
      setTimeout(setupFontAwesomeObserver, 100);
      return;
    }
    
    // Font Awesome is loaded. Configure observation:
    // - observeMutationsFallback: true enables the MutationObserver as fallback
    // - autoReplaceSvg: true (default) replaces i.fa-* with SVG
    // - keepOriginalSource: false (default) removes original elements
    // - searchPseudoElements: true checks :before/:after pseudo-elements
    window.FontAwesome.config.observeMutationsFallback = true;
    window.FontAwesome.config.autoReplaceSvg = 'replace';
    window.FontAwesome.config.mutationObserverOptions = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    };
    
    // Force Font Awesome to process any newly-added icons immediately
    // (this is called automatically by MutationObserver, but we prime it here)
    if (typeof window.FontAwesome.watch === 'function') {
      window.FontAwesome.watch();
    }
  }
  
  // Start watching after DOM is ready  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupFontAwesomeObserver);
  } else {
    setupFontAwesomeObserver();
  }
})();
</script>
JS;

        $document->head[] = $script;
    }
}
