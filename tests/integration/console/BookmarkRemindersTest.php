<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado\Tests\integration\console;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Post\Post;
use Flarum\Testing\integration\ConsoleTestCase;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\Test;

/** O comando `avocado:bookmark-reminders`: quem recebe o lembrete e o que fica nas notificações. */
class BookmarkRemindersTest extends ConsoleTestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ramon-avocado');

        $this->prepareDatabase([
            User::class => [
                $this->normalUser(),
                ['id' => 3, 'username' => 'ana', 'email' => 'ana@machine.local', 'is_email_confirmed' => 1],
            ],
            Discussion::class => [
                ['id' => 1, 'title' => 'Pública', 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => 1, 'comment_count' => 1, 'is_private' => 0],
                ['id' => 2, 'title' => 'Privada', 'created_at' => Carbon::now(), 'user_id' => 1, 'first_post_id' => 2, 'comment_count' => 1, 'is_private' => 1],
            ],
            Post::class => [
                ['id' => 1, 'discussion_id' => 1, 'created_at' => Carbon::now(), 'user_id' => 2, 'type' => 'comment', 'content' => '<t><p>Oi</p></t>', 'number' => 1],
                ['id' => 2, 'discussion_id' => 2, 'created_at' => Carbon::now(), 'user_id' => 1, 'type' => 'comment', 'content' => '<t><p>Oi</p></t>', 'number' => 1],
            ],
        ]);
    }

    private function bookmark(int $userId, int $discussionId): void
    {
        $this->database()->table('avocado_bookmarks')->insert([
            'user_id' => $userId,
            'discussion_id' => $discussionId,
            'created_at' => Carbon::now()->subDay(),
            'remind_at' => Carbon::now()->subMinute(),
        ]);
    }

    /** @return list<object> */
    private function reminders(int $discussionId): array
    {
        return $this->database()->table('notifications')
            ->where('type', 'avocadoBookmarkReminder')
            ->where('subject_id', $discussionId)
            ->orderBy('user_id')
            ->get()
            ->all();
    }

    #[Test]
    public function member_gets_the_reminder_for_a_discussion_they_can_see(): void
    {
        $this->bookmark(2, 1);

        $this->runCommand(['command' => 'avocado:bookmark-reminders']);

        $reminders = $this->reminders(1);

        $this->assertCount(1, $reminders);
        $this->assertSame(2, (int) $reminders[0]->user_id);
        $this->assertNotNull($this->database()->table('avocado_bookmarks')->where('user_id', 2)->value('reminder_sent_at'));
    }

    #[Test]
    public function reminder_is_dropped_when_the_discussion_is_not_visible(): void
    {
        $this->bookmark(2, 2);

        $this->runCommand(['command' => 'avocado:bookmark-reminders']);

        $this->assertCount(0, $this->reminders(2));
        $this->assertNotNull($this->database()->table('avocado_bookmarks')->where('user_id', 2)->value('reminder_sent_at'));
    }

    #[Test]
    public function reminders_of_two_users_on_the_same_discussion_both_stay(): void
    {
        $this->bookmark(2, 1);
        $this->runCommand(['command' => 'avocado:bookmark-reminders']);

        $this->bookmark(3, 1);
        $this->runCommand(['command' => 'avocado:bookmark-reminders']);

        $reminders = $this->reminders(1);

        $this->assertCount(2, $reminders);
        $this->assertFalse((bool) $reminders[0]->is_deleted, 'o lembrete do primeiro usuário não pode sumir');
        $this->assertFalse((bool) $reminders[1]->is_deleted);
    }
}
