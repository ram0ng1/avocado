<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\Avocado\Tests\Support;

use Illuminate\Container\Container;
use Illuminate\Database\Capsule\Manager as Capsule; /* harness de teste standalone, sem boot do Flarum; nosemgrep: flarum-v2-capsule-manager */
use Illuminate\Database\Connection;
use Illuminate\Events\Dispatcher;
use PDO;

/**
 * Conexões Eloquent para cada banco dos testes de migration e model.
 *
 * Os servidores vêm de variáveis no formato `key=value;key=value`:
 *   AVOCADO_TEST_MYSQL=host=127.0.0.1;port=3306;username=root;password=;database=avocado_test
 * Sem a variável (ou sem servidor) o banco é pulado e a suíte roda só com SQLite.
 * Sempre num banco `avocado_test` dedicado, nunca numa instalação real.
 */
final class Database
{
    /** Engine keys understood by use()/connection(). */
    public const ALL = ['sqlite', 'mysql', 'mariadb', 'pgsql'];

    private const DB_NAME = 'avocado_test';

    /** @var array<string, Connection|false> engine => connection, or false when unavailable */
    private static array $cache = [];

    private static ?Capsule $capsule = null;

    /** Conexão do banco, já como padrão do Eloquent, ou null se indisponível. */
    public static function use(string $engine): ?Connection
    {
        $conn = self::connection($engine);
        if ($conn !== null) {
            self::capsule()->getDatabaseManager()->setDefaultConnection($engine);
        }

        return $conn;
    }

    public static function connection(string $engine): ?Connection
    {
        if (array_key_exists($engine, self::$cache)) {
            return self::$cache[$engine] ?: null;
        }

        try {
            $conn = self::make($engine);
            $conn->select('SELECT 1');
            self::$cache[$engine] = $conn;

            return $conn;
        } catch (\Throwable $e) {
            self::$cache[$engine] = false;

            return null;
        }
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

    private static function make(string $engine): Connection
    {
        $config = match ($engine) {
            'sqlite'  => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true],
            'mysql'   => self::serverConfig('mysql', 'mysql', 3306),
            'mariadb' => self::serverConfig('mariadb', 'mariadb', 3306),
            'pgsql'   => self::serverConfig('pgsql', 'pgsql', 5432),
            default   => throw new \InvalidArgumentException("Unknown engine: $engine"),
        };

        $capsule = self::capsule();
        $capsule->addConnection($config, $engine);
        $conn = $capsule->getConnection($engine);

        if ($engine === 'sqlite') {
            // Liga as FKs mesmo que o build ignore a flag de configuração.
            $conn->statement('PRAGMA foreign_keys = ON');
        }

        return $conn;
    }

    /** @return array<string, mixed> */
    private static function serverConfig(string $engine, string $driver, int $defaultPort): array
    {
        $raw = getenv('AVOCADO_TEST_' . strtoupper($engine));
        if ($raw === false || trim($raw) === '') {
            throw new \RuntimeException("Engine $engine not configured");
        }

        $parts = [];
        foreach (explode(';', $raw) as $pair) {
            if (! str_contains($pair, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $pair, 2);
            $parts[trim($k)] = trim($v);
        }

        $host = $parts['host'] ?? '127.0.0.1';
        $port = (int) ($parts['port'] ?? $defaultPort);
        $user = $parts['username'] ?? ($parts['user'] ?? 'root');
        $pass = $parts['password'] ?? ($parts['pass'] ?? '');
        $db   = $parts['database'] ?? ($parts['db'] ?? self::DB_NAME);

        self::ensureDatabase($driver, $host, $port, $user, $pass, $db);

        $config = [
            'driver'   => $driver,
            'host'     => $host,
            'port'     => $port,
            'database' => $db,
            'username' => $user,
            'password' => $pass,
            'prefix'   => '',
        ];

        if ($driver === 'pgsql') {
            $config['charset'] = 'utf8';
            $config['schema']  = 'public';
        } else {
            $config['charset']   = 'utf8mb4';
            $config['collation'] = 'utf8mb4_unicode_ci';
        }

        return $config;
    }

    private static function ensureDatabase(string $driver, string $host, int $port, string $user, string $pass, string $db): void
    {
        // Identificador estrito: o CREATE DATABASE abaixo não aceita bind.
        if (! preg_match('/^[A-Za-z0-9_]+$/', $db)) {
            throw new \RuntimeException("Unsafe test database name: $db");
        }

        if ($driver === 'pgsql') {
            $pdo = new PDO("pgsql:host=$host;port=$port;dbname=postgres", $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            $exists = $pdo->query('SELECT 1 FROM pg_database WHERE datname = ' . $pdo->quote($db))->fetchColumn();
            if (! $exists) {
                $pdo->exec("CREATE DATABASE \"$db\" ENCODING 'UTF8'");
            }

            return;
        }

        // mysql / mariadb
        $pdo = new PDO("mysql:host=$host;port=$port", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    }
}
