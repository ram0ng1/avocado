<?php

declare(strict_types=1);

namespace Ramon\Avocado\Listener;

use Ramon\Avocado\Support\BundledAssets;

/**
 * Sincroniza os assets do tema nos mesmos eventos em que o core recompila os
 * dele (Enabled, Disabled, ClearingCache) — ver Support\BundledAssets.
 *
 * Forçado: o cache:clear é justamente o "conserta tudo" de quem atualizou a
 * extensão ou mexeu em public/assets à mão, então não confia no marcador.
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
