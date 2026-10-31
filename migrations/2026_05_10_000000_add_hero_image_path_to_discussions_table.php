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

use Flarum\Database\Migration;

// Mantida porque instalações existentes já a registraram; a coluna vai para a
// tabela companheira na migration 2026_05_24, na mesma rodada de migrate.
return Migration::addColumns('discussions', [
    'avocado_hero_image_path' => ['string', 'length' => 191, 'nullable' => true, 'default' => null],
]);
