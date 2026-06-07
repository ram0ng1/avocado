<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Unit;

use Flarum\Discussion\Discussion;
use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;
use Mockery;
use Mockery\Adapter\Phpunit\MockeryTestCase;
use PHPUnit\Framework\Attributes\Group;
use Ramon\Avocado\Access\DiscussionPolicy;

/**
 * DiscussionPolicy::uploadHeroImage() gates the hero-image upload by delegating
 * to the core `rename` ability. These tests pin that delegation:
 *  - actor who can rename  -> ALLOW
 *  - actor who cannot      -> null (abstain, NOT deny — so other policies still run)
 *
 * Returning deny() instead of null here would veto every other policy in the
 * chain (§3); the abstain contract is the part worth locking down.
 */
#[Group('security')]
final class DiscussionPolicyTest extends MockeryTestCase
{
    public function test_allows_upload_when_actor_can_rename_the_discussion(): void
    {
        $discussion = Mockery::mock(Discussion::class);

        $actor = Mockery::mock(User::class);
        $actor->shouldReceive('can')
            ->once()
            ->with('rename', $discussion)
            ->andReturnTrue();

        $result = (new DiscussionPolicy())->uploadHeroImage($actor, $discussion);

        self::assertSame(AbstractPolicy::ALLOW, $result);
    }

    public function test_abstains_when_actor_cannot_rename_the_discussion(): void
    {
        $discussion = Mockery::mock(Discussion::class);

        $actor = Mockery::mock(User::class);
        $actor->shouldReceive('can')
            ->once()
            ->with('rename', $discussion)
            ->andReturnFalse();

        $result = (new DiscussionPolicy())->uploadHeroImage($actor, $discussion);

        self::assertNull($result);
    }
}
