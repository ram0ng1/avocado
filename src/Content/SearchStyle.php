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
 * Põe a escolha de busca no <html> antes do primeiro paint. As regras da barra
 * inline (v1) ficam atrás do atributo porque o botão de busca do Flarum 2 é
 * dimensionado pelo core e não pode recebê-las. Só o valor não padrão é escrito.
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
