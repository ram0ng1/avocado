<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Integration;

use Illuminate\Database\Connection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Model\DiscussionHero;
use Ramon\Avocado\Tests\Support\Database;

/**
 * Drives the real create_avocado_discussion_heroes migration (up/down,
 * idempotency), the FK cascade that prevents orphaned hero rows (§26), and the
 * model's $guarded contract on the discussion_id PK (§7). Each test runs once
 * per available engine (sqlite always; mysql/mariadb/pgsql when configured via
 * AVOCADO_TEST_* env vars), so the migration DDL is validated cross-engine.
 */
final class DiscussionHeroTest extends TestCase
{
    private ?Connection $db = null;
    private ?Builder $schema = null;

    /** @return array<string, array{0: string}> */
    public static function engines(): array
    {
        return [
            'sqlite'  => ['sqlite'],
            'mysql'   => ['mysql'],
            'mariadb' => ['mariadb'],
            'pgsql'   => ['pgsql'],
        ];
    }

    private function boot(string $engine): void
    {
        $this->db = Database::use($engine);
        if ($this->db === null) {
            self::markTestSkipped("Database engine '$engine' is not available/configured.");
        }

        $this->schema = $this->db->getSchemaBuilder();

        // Clean slate (child-first for the FK), then a minimal core `discussions`
        // stand-in carrying the legacy column the migration migrates away from.
        $this->schema->dropIfExists('avocado_discussion_heroes');
        $this->schema->dropIfExists('discussions');
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

    protected function tearDown(): void
    {
        if ($this->schema !== null) {
            $this->schema->dropIfExists('avocado_discussion_heroes');
            $this->schema->dropIfExists('discussions');
        }
        $this->db = null;
        $this->schema = null;
    }

    /** @return array{up: callable, down: callable} */
    private function migration(): array
    {
        return require dirname(__DIR__, 2)
            . '/migrations/2026_05_24_000000_create_avocado_discussion_heroes_table.php';
    }

    #[DataProvider('engines')]
    public function test_up_creates_table_copies_legacy_rows_and_drops_old_column(string $engine): void
    {
        $this->boot($engine);

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

    #[DataProvider('engines')]
    public function test_up_is_idempotent(string $engine): void
    {
        $this->boot($engine);

        $up = $this->migration()['up'];
        $up($this->schema);
        $up($this->schema); // second run must not throw or double-copy

        self::assertSame(2, $this->db->table('avocado_discussion_heroes')->count());
    }

    #[DataProvider('engines')]
    public function test_down_restores_column_and_copies_data_back(string $engine): void
    {
        $this->boot($engine);

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
    #[DataProvider('engines')]
    public function test_deleting_a_discussion_cascades_to_the_hero_row(string $engine): void
    {
        $this->boot($engine);

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
    #[DataProvider('engines')]
    public function test_model_persists_and_guards_the_primary_key(string $engine): void
    {
        $this->boot($engine);

        $this->migration()['up']($this->schema);

        // $guarded = ['discussion_id'] — mass assignment must NOT set the PK.
        $hero = new DiscussionHero();
        $hero->fill(['discussion_id' => 999, 'image_path' => 'mass.webp']); /* o teste verifica exatamente a proteção contra mass assignment; nosemgrep: flarum-v2-mass-assignment */
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
