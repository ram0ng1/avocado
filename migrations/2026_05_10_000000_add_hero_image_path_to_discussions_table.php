<?php

declare(strict_types=1);

use Flarum\Database\Migration;

// Mantida apenas para instalações antigas que já registraram esta migração.
// A coluna é movida para uma tabela companheira por
// 2026_05_24_000000_create_avocado_discussion_heroes_table.php — instalações
// novas adicionam e dropam a coluna na mesma fase de upgrade.
return Migration::addColumns('discussions', [
    'avocado_hero_image_path' => ['string', 'length' => 191, 'nullable' => true, 'default' => null],
]);
