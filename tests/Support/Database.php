<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Support;

use Illuminate\Container\Container;
use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\Connection;
use Illuminate\Events\Dispatcher;

/**
 * Standalone Eloquent (Capsule) bootstrap for the integration suite, modelled
 * on the backup extension's tests/Support/Engines.php but trimmed to the one
 * engine that needs no server: in-memory SQLite (always available when
 * ext-pdo_sqlite is loaded).
 *
 * fresh() hands back a brand-new empty :memory: database on every call and
 * points Eloquent's default connection at it, so Flarum AbstractModel
 * subclasses (DiscussionHero) resolve through it and each test starts isolated.
 */
final class Database
{
    private static ?Capsule $capsule = null;

    private const NAME = 'avocado_test';

    public static function fresh(): Connection
    {
        $capsule = self::capsule();

        $capsule->addConnection([
            'driver'                  => 'sqlite',
            'database'                => ':memory:',
            'prefix'                  => '',
            'foreign_key_constraints' => true,
        ], self::NAME);

        // Drop any cached PDO so we reconnect to a pristine :memory: database.
        $capsule->getDatabaseManager()->purge(self::NAME);
        $capsule->getDatabaseManager()->setDefaultConnection(self::NAME);

        $conn = $capsule->getConnection(self::NAME);
        // Belt-and-braces: enforce FK constraints even if the config flag is
        // ignored by the bundled SQLite build.
        $conn->statement('PRAGMA foreign_keys = ON');

        return $conn;
    }

    private static function capsule(): Capsule
    {
        if (self::$capsule === null) {
            $c = new Capsule();
            $c->setEventDispatcher(new Dispatcher(new Container()));
            $c->setAsGlobal();
            $c->bootEloquent();
            self::$capsule = $c;
        }

        return self::$capsule;
    }
}
