<?php

declare(strict_types=1);

namespace Ramon\Avocado\Access;

use Flarum\Discussion\Discussion;
use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;

/**
 * Gates Avocado-specific discussion abilities so the controllers don't have to
 * hijack semantically-unrelated core abilities (e.g. `rename`).
 *
 * For now the only ability is `uploadHeroImage`, which defers to whoever can
 * already rename the discussion. Re-routing through a dedicated ability means
 * an admin can later relax/tighten it via a permission grant or override this
 * policy method without touching the upload controller.
 */
class DiscussionPolicy extends AbstractPolicy
{
    /**
     * Sem declaração de retorno de propósito: métodos de policy devolvem uma
     * das constantes string do AbstractPolicy (via os helpers allow()/deny()
     * e as variantes de precedência) ou null para se abster. Constranger a
     * ?bool gera TypeError, pois allow() devolve a string 'allow'.
     */
    public function uploadHeroImage(User $actor, Discussion $discussion)
    {
        return $actor->can('rename', $discussion) ? $this->allow() : null;
    }
}
