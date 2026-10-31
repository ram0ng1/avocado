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

namespace Ramon\Avocado\Console;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Notification\NotificationSyncer;
use Illuminate\Console\Command;
use Ramon\Avocado\Model\Bookmark;
use Ramon\Avocado\Notification\BookmarkReminderBlueprint;
use Ramon\Avocado\Support\BookmarksSetting;

/**
 * Envia os lembretes de bookmark vencidos. Roda sem ator, então a visibilidade
 * é conferida com o próprio destinatário: se ele não vê mais a discussão, o
 * lembrete é descartado. `reminder_sent_at` é carimbado mesmo no descarte, para
 * a linha não voltar a cada rodada; o que passar do lote sai na próxima.
 */
class SendBookmarkRemindersCommand extends Command
{
    protected $signature = 'avocado:bookmark-reminders';

    protected $description = 'Send due bookmark reminder notifications.';

    public const BATCH = 500;

    public function handle(NotificationSyncer $notifications, BookmarksSetting $bookmarks): void
    {
        if (! $bookmarks->enabled()) {
            $this->info('Bookmark system disabled; skipping.');

            return;
        }

        // with() logo após query() — no Eloquent\Builder cru; encadeá-lo depois
        // do where() faz o PHPStan (sem larastan) narrar para Query\Builder e
        // reclamar que with() não existe.
        $due = Bookmark::query()
            ->with(['user', 'discussion'])
            ->whereNotNull('remind_at')
            ->whereNull('reminder_sent_at')
            ->where('remind_at', '<=', Carbon::now())
            ->orderBy('remind_at')
            ->limit(self::BATCH)
            ->get();

        $sent = 0;

        /** @var Bookmark $bookmark */
        foreach ($due as $bookmark) {
            $user = $bookmark->user;
            $discussion = $bookmark->discussion;

            // `can('view')` não serve aqui: nenhuma policy concede essa
            // habilidade e o Gate cai para admin. A visibilidade real é o escopo.
            if ($user && $discussion && Discussion::whereVisibleTo($user)->whereKey($discussion->id)->exists()) {
                $notifications->sync(new BookmarkReminderBlueprint($discussion, $bookmark->id, $bookmark->remind_at), [$user]);
                $sent++;
            }

            $bookmark->reminder_sent_at = Carbon::now();
            $bookmark->save();
        }

        $this->info("Bookmark reminders: {$sent} sent, {$due->count()} processed.");
    }
}
