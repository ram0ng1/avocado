<?php

namespace Ramon\Avocado\Listener;

use Flarum\Messages\DialogMessage;

/**
 * AvocadoRealtimeDebugListener
 * 
 * Comprehensive debug listener for realtime issues.
 * Logs the complete flow of message creation and realtime broadcasting.
 */
class DispatchMessageCreatedEvent
{
    public function subscribe(\Illuminate\Contracts\Events\Dispatcher $events): void
    {
        $events->listen(
            \Flarum\Messages\DialogMessage\Event\Created::class,
            [$this, 'onCreated']
        );
    }

    public function onCreated(\Flarum\Messages\DialogMessage\Event\Created $event): void
    {
        $msg = $event->message;
        $dialogId = $msg->dialog_id;
        $dialog = $msg->dialog;
        
        // Get dialog users
        $users = $dialog->users()->get();
        $userIds = $users->pluck('id')->toArray();
        
        // Log with full context
        $lines = [
            "[Avocado-Realtime] ✓ DialogMessage Created event dispatched",
            "  Message ID: {$msg->id}",
            "  Dialog ID: {$dialogId}",
            "  Author: User #{$msg->user_id}",
            "  Dialog has " . count($users) . " users: [" . implode(', ', $userIds) . "]",
            "  Message text: " . mb_substr($msg->content, 0, 50) . "...",
            "",
        ];
        
        foreach ($lines as $line) {
            fwrite(\STDERR, $line . "\n");
        }
    }
}


