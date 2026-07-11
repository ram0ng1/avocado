<?php

declare(strict_types=1);

namespace Ramon\Avocado\Console;

use Illuminate\Console\Scheduling\Event;

class BookmarkReminderSchedule
{
    public function __invoke(Event $event): void
    {
        $event->everyFiveMinutes()->withoutOverlapping();
    }
}
