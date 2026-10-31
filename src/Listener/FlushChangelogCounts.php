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

namespace Ramon\Avocado\Listener;

use Ramon\Avocado\Api\ChangelogCounts;

/**
 * Invalida as contagens do changelog (Api\ChangelogCounts) sempre que o conjunto
 * "discussões em tag de produto" pode ter mudado. A escrita é rara; a leitura,
 * em toda página, só consulta o cache.
 */
class FlushChangelogCounts
{
    public function __construct(protected ChangelogCounts $counts)
    {
    }

    public function handle(): void
    {
        $this->counts->flush();
    }
}
