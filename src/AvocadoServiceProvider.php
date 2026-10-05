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
        // Singletons por request: o veredito do schema e as contagens do changelog
        // ficam memorizados na instância (uma consulta por request, no máximo), e
        // o SupportEvents guarda o ator que o middleware RememberActor anota para
        // o gancho do modelo ler.
        $this->container->singleton(SchemaInspector::class);
        $this->container->singleton(ChangelogCounts::class);
        $this->container->singleton(SupportEvents::class);

        // Supply TeamPageController with the *forum* Frontend without forcing it
        // to inject the container and resolve the 'flarum.frontend.forum' string
        // itself. Resolving that binding also runs the content-callback wiring
        // registered via Extend\Frontend('forum'), so the page renders identically.
        $this->container->when([TeamPageController::class, ChangelogPageController::class])
            ->needs(Frontend::class)
            ->give(fn () => $this->container->make('flarum.frontend.forum'));

        // O core pré-carrega as fontes do Font Awesome sem versão
        // (`/assets/fonts/fa-solid-900.woff2`), mas o LessCompiler grava no CSS
        // `fa-solid-900.woff2?v=<xxh128 do arquivo>`. URLs diferentes = o navegador
        // baixa as duas (~140 KB a mais em todo primeiro acesso) e ainda avisa que o
        // preload não foi usado. Aqui o preload ganha o mesmo `?v=` do CSS.
        $this->container->extend('flarum.frontend.default_preloads', function ($preloads) {
            return is_array($preloads) ? FontPreloads::versioned($preloads, $this->container->make(Paths::class)->public.'/assets/fonts') : $preloads;
        });
    }

    public function boot(BundledAssets $bundled): void
    {
        // Assets do tema (fontes, fire.webp): a cópia acompanha os eventos em que
        // o core recompila os assets dele (Listener\SyncBundledAssets). Aqui só
        // um stat, para o caso de um public/assets recém-criado sem o marcador —
        // antes eram ~6 stats + a leitura do marcador em todo request.
        if (! is_file($bundled->markerPath())) {
            $bundled->sync();
        }
    }
}
