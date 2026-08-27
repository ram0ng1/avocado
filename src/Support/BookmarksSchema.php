<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\ConnectionInterface;
use Throwable;

/**
 * A tabela `avocado_bookmarks` existe neste banco?
 *
 * Parece supérfluo — a migration cria a tabela — mas o tema é distribuído como
 * pacote: um `composer update` entrega o código novo e a tabela só nasce no
 * `php flarum migrate` seguinte. Nessa janela o eager-load do bookmark rodava
 * em TODA listagem de discussões e derrubava o fórum inteiro com
 * "Base table or view not found: 1146 avocado_bookmarks doesn't exist" — a home
 * quebrava por causa de um recurso opcional que o admin nem tinha migrado.
 * O mesmo vale para quem restaura um dump anterior à migration.
 *
 * Com a checagem, a ausência da tabela apenas desliga o sistema de bookmarks
 * (BookmarksSetting::enabled devolve false e o eager-load some do endpoint);
 * rodar as migrations religa tudo.
 *
 * Custo: um `hasTable` por request enquanto a tabela não existe. Assim que
 * existe, a resposta vai para o cache do Flarum e nenhuma consulta extra sobra
 * no caminho quente. Um `php flarum cache:clear` reavalia — é o passo que o
 * próprio rollback da migration já pede.
 */
final class BookmarksSchema
{
    public const TABLE = 'avocado_bookmarks';

    private const CACHE_KEY = 'avocado.bookmarks_table_exists';

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

            // Só o "existe" é cacheado: uma tabela criada não desaparece sozinha,
            // enquanto o "não existe" precisa continuar sendo reavaliado a cada
            // request para o sistema religar assim que o admin migrar.
            if ($exists) {
                $cache->forever(self::CACHE_KEY, true);
            }

            return self::$exists = $exists;
        } catch (Throwable) {
            // Banco fora do ar, credenciais erradas, install em andamento: o
            // tema não é o lugar de estourar por isso.
            return self::$exists = false;
        }
    }

    /** Ponto de teste — zera o memo do request. */
    public static function forget(): void
    {
        self::$exists = null;
    }
}
