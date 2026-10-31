<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Post\Post;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\Test;

/** PATCH /api/avocado/bookmark: o horário do lembrete é gravado em UTC. */
class BookmarkReminderTimeTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ramon-avocado');

        $this->prepareDatabase([
            User::class => [$this->normalUser()],
            Discussion::class => [
                ['id' => 1, 'title' => 'Pública', 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => 1, 'comment_count' => 1],
            ],
            Post::class => [
                ['id' => 1, 'discussion_id' => 1, 'created_at' => Carbon::now(), 'user_id' => 2, 'type' => 'comment', 'content' => '<t><p>Oi</p></t>', 'number' => 1],
            ],
        ]);
    }

    #[Test]
    public function reminder_with_an_offset_is_stored_as_the_same_instant_in_utc(): void
    {
        $local = Carbon::now()->addDays(3)->setTimezone('-03:00')->startOfMinute();

        $response = $this->send(
            $this->request('PATCH', '/api/avocado/bookmark', [
                'authenticatedAs' => 2,
                'json' => ['discussionId' => '1', 'remindAt' => $local->toIso8601String()],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());

        $stored = $this->database()->table('avocado_bookmarks')->where('user_id', 2)->value('remind_at');

        $this->assertSame($local->copy()->utc()->format('Y-m-d H:i:s'), Carbon::parse($stored)->format('Y-m-d H:i:s'));
    }
}
