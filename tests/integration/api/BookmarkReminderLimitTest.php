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
use Psr\Http\Message\ResponseInterface;

/**
 * Teto de lembretes pendentes por usuário: o comando envia um lote por rodada,
 * e sem limite um único usuário enchia a fila e atrasava os lembretes de todos.
 */
class BookmarkReminderLimitTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    private const LIMIT = 100;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ramon-avocado');

        $discussions = $posts = $bookmarks = [];
        for ($id = 1; $id <= self::LIMIT + 1; $id++) {
            $discussions[] = ['id' => $id, 'title' => "D$id", 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => $id, 'comment_count' => 1];
            $posts[] = ['id' => $id, 'discussion_id' => $id, 'created_at' => Carbon::now(), 'user_id' => 2, 'type' => 'comment', 'content' => '<t><p>x</p></t>', 'number' => 1];
            if ($id <= self::LIMIT) {
                $bookmarks[] = ['user_id' => 2, 'discussion_id' => $id, 'created_at' => Carbon::now(), 'remind_at' => Carbon::now()->addDay()];
            }
        }

        $this->prepareDatabase([
            User::class => [$this->normalUser()],
            Discussion::class => $discussions,
            Post::class => $posts,
            'avocado_bookmarks' => $bookmarks,
        ]);
    }

    private function remind(int $discussionId): ResponseInterface
    {
        return $this->send($this->request('PATCH', '/api/avocado/bookmark', [
            'authenticatedAs' => 2,
            'json' => ['discussionId' => (string) $discussionId, 'remindAt' => Carbon::now()->addDays(2)->toIso8601String()],
        ]));
    }

    #[Test]
    public function a_reminder_beyond_the_limit_is_refused(): void
    {
        $response = $this->remind(self::LIMIT + 1);

        $this->assertEquals(422, $response->getStatusCode(), (string) $response->getBody());
    }

    #[Test]
    public function rescheduling_an_existing_reminder_is_still_allowed(): void
    {
        $this->assertEquals(200, $this->remind(1)->getStatusCode());
    }

    #[Test]
    public function a_sent_reminder_frees_its_slot(): void
    {
        $this->database()->table('avocado_bookmarks')->where('discussion_id', 1)->update(['reminder_sent_at' => Carbon::now()]);

        $this->assertEquals(200, $this->remind(self::LIMIT + 1)->getStatusCode());
    }
}
