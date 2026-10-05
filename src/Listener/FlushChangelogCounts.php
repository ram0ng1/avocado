<?php

declare(strict_types=1);

namespace Ramon\Avocado\Listener;

use Ramon\Avocado\Api\ChangelogCounts;

/**
 * Invalida o cache das contagens do changelog (Api\ChangelogCounts) sempre que
 * o conjunto "discussões em tag de produto" pode ter mudado: discussão criada,
 * apagada, ocultada/restaurada, retagueada, ou tag removida (o cascade leva as
 * linhas de `discussion_tag` junto).
 *
 * Compute-at-write: o custo vai para a escrita, rara; a leitura, em toda página,
 * só consulta o cache.
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
