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
use Flarum\Group\Group;
use Flarum\Post\Post;
use Flarum\Tags\Tag;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\Test;

/** O que o tema acrescenta ao documento do fórum (`GET /api`), que também vai para visitantes. */
class ForumAttributesTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('flarum-tags', 'ramon-avocado');
    }

    /** @return array<string, mixed> */
    private function forumAttributes(?int $userId = null): array
    {
        $response = $this->send($this->request('GET', '/api', $userId ? ['authenticatedAs' => $userId] : []));

        $this->assertEquals(200, $response->getStatusCode());

        return json_decode((string) $response->getBody(), true)['data']['attributes'];
    }

    #[Test]
    public function counts_are_zero_while_the_features_are_off(): void
    {
        $attributes = $this->forumAttributes();

        $this->assertSame(0, $attributes['avocadoTeamPageMemberCount']);
        $this->assertSame(0, $attributes['avocadoShowcaseItemCount']);
    }

    #[Test]
    public function showcase_count_leaves_out_discussions_a_guest_cannot_see(): void
    {
        $this->prepareDatabase([
            Tag::class => [['id' => 1, 'name' => 'Vitrine', 'slug' => 'vitrine', 'position' => 0]],
            User::class => [$this->normalUser()],
            Discussion::class => [
                ['id' => 1, 'title' => 'Visível', 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => 1, 'comment_count' => 1],
                ['id' => 2, 'title' => 'Oculta', 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => 2, 'comment_count' => 1, 'hidden_at' => Carbon::now()],
                ['id' => 3, 'title' => 'Privada', 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => 3, 'comment_count' => 1, 'is_private' => 1],
            ],
            Post::class => [
                ['id' => 1, 'discussion_id' => 1, 'created_at' => Carbon::now(), 'user_id' => 2, 'type' => 'comment', 'content' => '<t><p>a</p></t>', 'number' => 1],
                ['id' => 2, 'discussion_id' => 2, 'created_at' => Carbon::now(), 'user_id' => 2, 'type' => 'comment', 'content' => '<t><p>b</p></t>', 'number' => 1],
                ['id' => 3, 'discussion_id' => 3, 'created_at' => Carbon::now(), 'user_id' => 2, 'type' => 'comment', 'content' => '<t><p>c</p></t>', 'number' => 1],
            ],
            'discussion_tag' => [
                ['discussion_id' => 1, 'tag_id' => 1],
                ['discussion_id' => 2, 'tag_id' => 1],
                ['discussion_id' => 3, 'tag_id' => 1],
            ],
        ]);

        $this->setting('avocado.showcase_enabled', '1');
        $this->setting('avocado.showcase_tag', '["1"]');

        $this->assertSame(1, $this->forumAttributes()['avocadoShowcaseItemCount']);
    }

    #[Test]
    public function team_count_is_hidden_from_who_cannot_search_users(): void
    {
        $this->prepareDatabase([
            User::class => [$this->normalUser()],
            'group_permission' => [['permission' => 'searchUsers', 'group_id' => Group::MEMBER_ID]],
        ]);

        $this->setting('avocado.team_page_enabled', '1');
        $this->setting('avocado.team_page_groups', '['.Group::ADMINISTRATOR_ID.']');

        $this->assertSame(0, $this->forumAttributes()['avocadoTeamPageMemberCount']);
        $this->assertSame(1, $this->forumAttributes(2)['avocadoTeamPageMemberCount']);
    }
}
