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

use Flarum\Discussion\Event\Deleting;
use Illuminate\Contracts\Filesystem\Factory;
use Ramon\Avocado\Model\DiscussionHero;

/**
 * Apaga o arquivo do hero junto com a discussão. Roda no `Deleting`: depois do
 * DELETE a linha já saiu pelo FK em cascata e não há mais como achar o arquivo.
 */
class DeleteDiscussionHeroFile
{
    public function __construct(
        protected Factory $filesystem,
    ) {
    }

    public function handle(Deleting $event): void
    {
        $path = DiscussionHero::query()->whereKey($event->discussion->id)->value('image_path');

        if (! $path) {
            return;
        }

        $disk = $this->filesystem->disk('flarum-assets');

        if ($disk->exists($path)) {
            $disk->delete($path);
        }
    }
}
