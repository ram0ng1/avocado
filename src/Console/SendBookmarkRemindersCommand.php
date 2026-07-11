<?php

declare(strict_types=1);

namespace Ramon\Avocado\Console;

use Carbon\Carbon;
use Flarum\Notification\NotificationSyncer;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Console\Command;
use Ramon\Avocado\Model\Bookmark;
use Ramon\Avocado\Notification\BookmarkReminderBlueprint;
use Ramon\Avocado\Support\BookmarksSetting;

/**
 * Envia os lembretes de bookmark vencidos. Roda sem ator (schedule, §20), por
 * isso a visibilidade é re-checada com as permissões do próprio destinatário
 * antes do sync (§19) — se a discussão ficou privada, o lembrete é descartado.
 * `reminder_sent_at` é sempre carimbado, mesmo no descarte, para o scheduler
 * não reprocessar a mesma linha para sempre. O lote é limitado por execução;
 * o que sobrar sai na próxima rodada do schedule.
 */
class SendBookmarkRemindersCommand extends Command
{
    protected $signature = 'avocado:bookmark-reminders';

    protected $description = 'Send due bookmark reminder notifications.';

    public const BATCH = 500;

    public function handle(NotificationSyncer $notifications, SettingsRepositoryInterface $settings): void
    {
        if (! BookmarksSetting::enabled($settings)) {
            $this->info('Bookmark system disabled; skipping.');

            return;
        }

        $due = Bookmark::query()
            ->whereNotNull('remind_at')
            ->whereNull('reminder_sent_at')
            ->where('remind_at', '<=', Carbon::now())
            ->with(['user', 'discussion'])
            ->orderBy('remind_at')
            ->limit(self::BATCH)
            ->get();

        $sent = 0;

        foreach ($due as $bookmark) {
            $user = $bookmark->user;
            $discussion = $bookmark->discussion;

            if ($user && $discussion && $user->can('view', $discussion)) {
                $notifications->sync(new BookmarkReminderBlueprint($discussion), [$user]);
                $sent++;
            }

            $bookmark->reminder_sent_at = Carbon::now();
            $bookmark->save();
        }

        $this->info("Bookmark reminders: {$sent} sent, {$due->count()} processed.");
    }
}
