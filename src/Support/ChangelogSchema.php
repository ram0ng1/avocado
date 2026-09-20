<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\ConnectionInterface;
use Throwable;

/**
 * A tabela `avocado_changelog_entries` existe neste banco?
 *
 * Pelo mesmo motivo do BookmarksSchema: o tema chega por `composer update` e a
 * tabela só nasce no `php flarum migrate` seguinte. Nessa janela o eager-load de
 * `avocadoChangelog` rodaria em TODA listagem de discussões e derrubaria o fórum
 * com "Base table or view not found". Sem a tabela, a versão e a capa do
 * changelog só ficam fora do ar (campos ocultos e não graváveis); rodar as
 * migrations religa tudo.
 *
 * Só o "existe" é cacheado — o "não existe" é reavaliado a cada request para o
 * recurso ligar assim que o admin migrar.
 */
final class ChangelogSchema
{
    public const TABLE = 'avocado_changelog_entries';

    private const CACHE_KEY = 'avocado.changelog_table_exists';

    /** Memo do request; null = ainda não checado. */
    private static ?bool $exists = null;

    public static function available(): bool
    {
        if (self::$exists !== null) {
            return self::$exists;
        }

        try {
            $cache = resolve(CacheRepository::class);

            if ($cache->get(self::CACHE_KEY)) {
                return self::$exists = true;
            }

            $exists = resolve(ConnectionInterface::class)
                ->getSchemaBuilder()
                ->hasTable(self::TABLE);

            if ($exists) {
                $cache->forever(self::CACHE_KEY, true);
            }

            return self::$exists = $exists;
        } catch (Throwable) {
            // Banco fora do ar ou install em andamento: o tema não é o lugar de estourar por isso.
            return self::$exists = false;
        }
    }

    /** Ponto de teste — zera o memo do request. */
    public static function forget(): void
    {
        self::$exists = null;
    }
}
