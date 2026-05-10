<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasColumn('discussions', 'avocado_hero_image_path')) {
            $schema->table('discussions', function (Blueprint $table) {
                $table->string('avocado_hero_image_path', 191)->nullable()->default(null);
            });
        }
    },
    'down' => function (Builder $schema) {
        if ($schema->hasColumn('discussions', 'avocado_hero_image_path')) {
            $schema->table('discussions', function (Blueprint $table) {
                $table->dropColumn('avocado_hero_image_path');
            });
        }
    },
];
