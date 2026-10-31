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
use Flarum\Tags\Tag;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\Test;

/**
 * As versões do changelog saem das contagens de discussões do autor e da tag.
 * Só se desconta o que a contagem do core inclui: privadas nunca entram na do
 * usuário, e privadas ou ocultas nunca entram na da tag.
 */
class ChangelogCountsTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('flarum-tags', 'ramon-avocado');

        $discussion = fn (int $id, array $extra = []) => [
            'id' => $id, 'title' => "D$id", 'created_at' => Carbon::now(), 'user_id' => 2,
            'first_post_id' => $id, 'comment_count' => 1, ...$extra,
        ];
        $post = fn (int $id) => [
            'id' => $id, 'discussion_id' => $id, 'created_at' => Carbon::now(), 'user_id' => 2,
            'type' => 'comment', 'content' => '<t><p>x</p></t>', 'number' => 1,
        ];

        $this->prepareDatabase([
            // Contagens como o core as manteria: o usuário conta as 4 públicas,
            // ocultas inclusive (1, 2, 4 e 5); a tag do produto, só as públicas
            // e visíveis (1 e 2).
            Tag::class => [
                ['id' => 1, 'name' => 'Produto', 'slug' => 'produto', 'position' => 0, 'discussion_count' => 2],
                ['id' => 2, 'name' => 'Geral', 'slug' => 'geral', 'position' => 1, 'discussion_count' => 1],
            ],
            User::class => [[...$this->normalUser(), 'discussion_count' => 4]],
            Discussion::class => [
                $discussion(1),
                $discussion(2),
                $discussion(3, ['is_private' => 1]),
                $discussion(4, ['hidden_at' => Carbon::now()]),
                $discussion(5),
            ],
            Post::class => array_map($post, [1, 2, 3, 4, 5]),
            'discussion_tag' => [
                ['discussion_id' => 1, 'tag_id' => 1],
                ['discussion_id' => 2, 'tag_id' => 1],
                ['discussion_id' => 3, 'tag_id' => 1],
                ['discussion_id' => 4, 'tag_id' => 1],
                ['discussion_id' => 5, 'tag_id' => 2],
            ],
        ]);

        $this->setting('avocado.changelog_enabled', '1');
        $this->setting('avocado.changelog_tags', '["1"]');

        // As linhas acima entram sem os eventos que limpam o cache das contagens.
        $this->app()->getContainer()->make('cache.store')->forget(\Ramon\Avocado\Api\ChangelogCounts::CACHE_KEY);
    }

    #[Test]
    public function author_count_only_loses_the_releases_it_includes(): void
    {
        $response = $this->send($this->request('GET', '/api/users/2', ['authenticatedAs' => 1]));

        $this->assertEquals(200, $response->getStatusCode());

        // 4 públicas − 3 versões públicas (1, 2 e a oculta 4) = só a discussão comum.
        $this->assertSame(1, json_decode((string) $response->getBody(), true)['data']['attributes']['discussionCount']);
    }

    #[Test]
    public function product_tag_count_reads_zero(): void
    {
        $response = $this->send($this->request('GET', '/api/tags', ['authenticatedAs' => 1]));

        $this->assertEquals(200, $response->getStatusCode());

        $counts = [];
        foreach (json_decode((string) $response->getBody(), true)['data'] as $tag) {
            $counts[$tag['id']] = $tag['attributes']['discussionCount'];
        }

        $this->assertSame(0, $counts['1']);
        $this->assertSame(1, $counts['2']);
    }
}
