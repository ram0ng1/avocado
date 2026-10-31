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

use Flarum\Testing\integration\TestCase;
use PHPUnit\Framework\Attributes\Test;

/** O que o tema acrescenta ao documento do fórum (`GET /api`). */
class ForumAttributesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ramon-avocado');
    }

    #[Test]
    public function guest_sees_the_theme_attributes(): void
    {
        $response = $this->send($this->request('GET', '/api'));

        $this->assertEquals(200, $response->getStatusCode());

        $attributes = json_decode((string) $response->getBody(), true)['data']['attributes'];

        $this->assertSame(0, $attributes['avocadoTeamPageMemberCount']);
        $this->assertSame(0, $attributes['avocadoShowcaseItemCount']);
    }
}
