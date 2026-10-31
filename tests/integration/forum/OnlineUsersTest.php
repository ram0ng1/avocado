<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado\Tests\integration\forum;

use Carbon\Carbon;
use Flarum\Group\Group;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\Test;

/** A lista de quem está online, que vai no <head> da página (`window.__avocadoOnlineUsers`). */
class OnlineUsersTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ramon-avocado');
    }

    /** @return list<array<string, mixed>> */
    private function onlineUsers(int $userId): array
    {
        $response = $this->send($this->request('GET', '/', ['authenticatedAs' => $userId]));
        $html = (string) $response->getBody();

        $this->assertSame(1, preg_match('/window\.__avocadoOnlineUsers=(\[.*?\]);<\/script>/s', $html, $m), 'a lista sai no <head>');

        return json_decode($m[1], true);
    }

    #[Test]
    public function member_without_view_forum_gets_an_empty_list(): void
    {
        $this->prepareDatabase([
            User::class => [
                ['id' => 3, 'username' => 'pendente', 'email' => 'p@machine.local', 'is_email_confirmed' => 0, 'last_seen_at' => Carbon::now()],
                ['id' => 4, 'username' => 'online', 'email' => 'o@machine.local', 'is_email_confirmed' => 1, 'last_seen_at' => Carbon::now()],
            ],
        ]);

        // Fórum fechado: só membros confirmados veem.
        $this->database()->table('group_permission')->where('permission', 'viewForum')->delete();
        $this->database()->table('group_permission')->insert(['permission' => 'viewForum', 'group_id' => Group::MEMBER_ID]);

        $this->assertSame([], $this->onlineUsers(3));
        $this->assertContains('online', array_column($this->onlineUsers(4), 'username'));
    }

    #[Test]
    public function the_most_recently_seen_users_are_listed_first(): void
    {
        $users = [];
        for ($id = 3; $id <= 62; $id++) {
            $users[] = [
                'id' => $id, 'username' => "u$id", 'email' => "u$id@machine.local", 'is_email_confirmed' => 1,
                // O mais recente é o último inserido: sem ORDER BY o banco devolve os primeiros.
                'last_seen_at' => Carbon::now()->subSeconds(200 - $id),
            ];
        }
        $this->prepareDatabase([User::class => $users]);

        $listed = array_column($this->onlineUsers(62), 'username');

        $this->assertCount(50, $listed);
        $this->assertContains('u62', $listed);
        $this->assertNotContains('u3', $listed);
    }
}
