<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado;

use Flarum\Foundation\AbstractServiceProvider;
use Flarum\Foundation\Paths;
use Flarum\Frontend\Frontend;
use Ramon\Avocado\Api\ChangelogCounts;
use Ramon\Avocado\Controller\ChangelogPageController;
use Ramon\Avocado\Controller\TeamPageController;
use Ramon\Avocado\Support\BundledAssets;
use Ramon\Avocado\Support\SchemaInspector;
use Ramon\Avocado\Support\SupportEvents;

class AvocadoServiceProvider extends AbstractServiceProvider
{
    public function register(): void
    {
        // Singletons: memorizam o veredito do schema e as contagens por request, e o
        // SupportEvents guarda o ator que o RememberActor anota para o gancho do modelo.
        $this->container->singleton(SchemaInspector::class);
        $this->container->singleton(ChangelogCounts::class);
        $this->container->singleton(SupportEvents::class);

        // Entrega o Frontend do fórum (com os content callbacks já ligados) sem os
        // controllers dependerem do container.
        $this->container->when([TeamPageController::class, ChangelogPageController::class])
            ->needs(Frontend::class)
            ->give(fn () => $this->container->make('flarum.frontend.forum'));

        // O core pré-carrega as fontes do Font Awesome sem o `?v=` que o LessCompiler
        // põe no CSS, e o navegador baixa as duas URLs. O preload ganha o mesmo `?v=`.
        $this->container->extend('flarum.frontend.default_preloads', function ($preloads) {
            return is_array($preloads) ? FontPreloads::versioned($preloads, $this->container->make(Paths::class)->public.'/assets/fonts') : $preloads;
        });
    }

    public function boot(BundledAssets $bundled): void
    {
        // A cópia dos assets acompanha a recompilação do core (Listener\SyncBundledAssets);
        // aqui só um stat, para um public/assets recém-criado sem o marcador.
        if (! is_file($bundled->markerPath())) {
            $bundled->sync();
        }
    }
}
