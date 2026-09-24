<?php

declare(strict_types=1);

namespace Ramon\Avocado;

use Flarum\Foundation\AbstractServiceProvider;
use Ramon\Avocado\Support\SupportEvents;

/**
 * Liga o observador de status ao modelo da extensão linkrobins/support. Só é
 * registrado com a extensão ativa (Extend\Conditional no extend.php), e ainda
 * assim confere o autoload — a extensão pode estar ativa no banco e ausente do
 * vendor no meio de um deploy.
 */
class SupportEventsServiceProvider extends AbstractServiceProvider
{
    public function boot(): void
    {
        if (! SupportEvents::ticketModelAvailable()) {
            return;
        }

        $model = SupportEvents::TICKET_MODEL;

        $model::updated(fn ($ticket) => SupportEvents::onTicketUpdated($ticket));
    }
}
