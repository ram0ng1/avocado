<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Preconnect para o Kit do Font Awesome e o modo mutation-observer, para os
 * ícones .fa-kit que o Mithril insere renderizarem sem flash. Opt-in no admin:
 * o script do Kit em si é colado pelo admin (custom_header).
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
