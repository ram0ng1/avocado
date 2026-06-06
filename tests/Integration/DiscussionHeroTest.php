<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Integration;

use Illuminate\Database\Connection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Model\DiscussionHero;
use Ramon\Avocado\Tests\Support\Database;

/**
 * Drives the REAL create_avocado_discussion_heroes migration and the
 * DiscussionHero model against an in-memory SQLite database (the backup
 * extension's Support/Engines.php pattern, trimmed to the serverless engine).
 *
 * Exercises the parts most likely to regress on a refactor:
 *  - the migration's three idempotent up steps (create / copy legacy rows /
 *    drop the old column) and the down round-trip,
 *  - the FK cascade that prevents orphaned hero rows when a discussion is
 *    deleted (§26 — orphans re-expose deleted content),
 *  - the model's $guarded contract on the discussion_id primary key (§7).
 */
final class DiscussionHeroTest extends TestCase
{
    private Connection $db;
    private Builder $schema;

    protected function setUp(): void
    {
        if (! extension_loaded('pdo_sqlite')) {
            self::markTestSkipped('ext-pdo_sqlite is required for the database integration suite.');
        }

        $this->db = Database::fresh();
        $this->schema = $this->db->getSchemaBuilder();

        // Minimal stand-in for the core `discussions` table, including the
        // legacy column the migration migrates away from.
        $this->schema->create('discussions', function (Blueprint $t) {
            $t->increments('id');
            $t->string('title')->nullable();
            $t->string('avocado_hero_image_path', 191)->nullable();
        });

        $this->db->table('discussions')->insert([
            ['id' => 1, 'title' => 'A', 'avocado_hero_image_path' => 'avocado-disc-hero-1-abc.webp'],
            ['id' => 2, 'title' => 'B', 'avocado_hero_image_path' => null],
            ['id' => 3, 'title' => 'C', 'avocado_hero_image_path' => 'avocado-disc-hero-3-xyz.webp'],
        ]);
    }

    /** @return array{up: callable, down: callable} */
    private function migration(): array
    {
        return require dirname(__DIR__, 2)
            . '/migrations/2026_05_24_000000_create_avocado_discussion_heroes_table.php';
    }

    public function test_up_creates_table_copies_legacy_rows_and_drops_old_column(): void
    {
        ($this->migration()['up'])($this->schema);

        self::assertTrue($this->schema->hasTable('avocado_discussion_heroes'));
        self::assertFalse($this->schema->hasColumn('discussions', 'avocado_hero_image_path'));

        $rows = $this->db->table('avocado_discussion_heroes')->orderBy('discussion_id')->get();
        // Only the two rows with a non-null legacy value are copied.
        self::assertCount(2, $rows);
        self::assertSame(1, (int) $rows[0]->discussion_id);
        self::assertSame('avocado-disc-hero-1-abc.webp', $rows[0]->image_path);
        self::assertSame(3, (int) $rows[1]->discussion_id);
        self::assertSame('avocado-disc-hero-3-xyz.webp', $rows[1]->image_path);
    }

    public function test_up_is_idempotent(): void
    {
        $up = $this->migration()['up'];
        $up($this->schema);
        $up($this->schema); // second run must not throw or double-copy

        self::assertSame(2, $this->db->table('avocado_discussion_heroes')->count());
    }

    public function test_down_restores_column_and_copies_data_back(): void
    {
        $m = $this->migration();
        $m['up']($this->schema);
        $m['down']($this->schema);

        self::assertFalse($this->schema->hasTable('avocado_discussion_heroes'));
        self::assertTrue($this->schema->hasColumn('discussions', 'avocado_hero_image_path'));

        self::assertSame(
            'avocado-disc-hero-1-abc.webp',
            $this->db->table('discussions')->where('id', 1)->value('avocado_hero_image_path')
        );
        self::assertNull(
            $this->db->table('discussions')->where('id', 2)->value('avocado_hero_image_path')
        );
    }

    #[Group('security')]
    public function test_deleting_a_discussion_cascades_to_the_hero_row(): void
    {
        $this->migration()['up']($this->schema);

        $this->db->table('avocado_discussion_heroes')->insert([
            'discussion_id' => 2,
            'image_path'    => 'orphan-candidate.webp',
        ]);

        $this->db->table('discussions')->where('id', 2)->delete();

        self::assertSame(
            0,
            $this->db->table('avocado_discussion_heroes')->where('discussion_id', 2)->count(),
            'FK cascadeOnDelete must remove the hero row with its discussion'
        );
    }

    #[Group('security')]
    public function test_model_persists_and_guards_the_primary_key(): void
    {
        $this->migration()['up']($this->schema);

        // $guarded = ['discussion_id'] — mass assignment must NOT set the PK.
        $hero = new DiscussionHero();
        $hero->fill(['discussion_id' => 999, 'image_path' => 'mass.webp']);
        self::assertNull($hero->discussion_id);

        // Explicit assignment is the only allowed path for the server-controlled PK.
        $hero->discussion_id = 2;
        $hero->image_path = 'mass.webp';
        $hero->save();

        $fresh = DiscussionHero::query()->find(2);
        self::assertNotNull($fresh);
        self::assertSame(2, $fresh->discussion_id);
        self::assertSame('mass.webp', $fresh->image_path);
    }
}
