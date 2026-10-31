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

use Ramon\Avocado\Support\BundledAssets;

/**
 * Copia os assets do tema quando o core recompila os dele. Forçado, sem confiar
 * no marcador: o cache:clear é o "conserta tudo" de quem mexeu em public/assets.
 */
class SyncBundledAssets
{
    public function __construct(protected BundledAssets $assets)
    {
    }

    public function handle(): void
    {
        $this->assets->sync(force: true);
    }
}
