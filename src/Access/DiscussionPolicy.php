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

namespace Ramon\Avocado\Access;

use Flarum\Discussion\Discussion;
use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;

/**
 * Habilidades próprias do tema, para os controllers não pegarem carona em
 * habilidades do core como `rename`; outra policy pode sobrescrever a regra.
 */
class DiscussionPolicy extends AbstractPolicy
{
    /**
     * Quem pode renomear a discussão pode trocar a imagem do hero; null deixa
     * outras policies decidirem.
     */
    public function uploadHeroImage(User $actor, Discussion $discussion): ?string
    {
        return $actor->can('rename', $discussion) ? $this->allow() : null;
    }
}
