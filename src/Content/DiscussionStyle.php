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
 * Põe o estilo de discussão no <html> antes do primeiro paint: pelo bundle o
 * atributo chegaria um quadro atrasado e a página trocaria de layout na tela.
 * Só o valor não padrão é escrito.
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
