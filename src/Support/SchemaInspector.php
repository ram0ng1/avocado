<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\Connection;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Schema\Builder as SchemaBuilder;
use RuntimeException;
use Throwable;

/**
 * "Esta tabela (ou coluna) existe neste banco?" — a checagem que vários
 * recursos opcionais do tema fazem antes de tocar no próprio schema.
 *
 * O tema é distribuído como pacote: um `composer update` entrega o código novo
 * e as tabelas só nascem no `php flarum migrate` seguinte. Nessa janela, um
 * eager-load ou uma escrita na tabela que ainda não existe derrubaria páginas
 * inteiras ("Base table or view not found"). Com a checagem, a ausência só
 * desliga o recurso; rodar as migrations religa.
 *
 * Só o "existe" vai para o cache do Flarum (uma tabela criada não some
 * sozinha); o "não existe" é reavaliado a cada request, para o recurso ligar
 * assim que o admin migrar. Um `php flarum cache:clear` reavalia tudo. Dentro do
 * request o veredito fica memorizado na instância — registrada como singleton
 * no AvocadoServiceProvider, então é uma consulta por tabela por request, no
 * máximo, e nada que sobreviva ao processo além do cache.
 */
final class SchemaInspector
{
    /** @var array<string, bool> chave do cache => veredito deste request */
    private array $memo = [];

    public function __construct(
        private readonly CacheRepository $cache,
        private readonly ConnectionInterface $db,
    ) {
    }

    public function hasTable(string $table, string $cacheKey): bool
    {
        return $this->check($cacheKey, fn (): bool => $this->schemaBuilder()->hasTable($table));
    }

    public function hasColumn(string $table, string $column, string $cacheKey): bool
    {
        return $this->check($cacheKey, fn (): bool => $this->schemaBuilder()->hasColumn($table, $column));
    }

    /** Ponto de teste — zera os vereditos do request. */
    public function forget(): void
    {
        $this->memo = [];
    }

    /**
     * O schema builder vem da Connection concreta, não da interface. A conexão
     * do Flarum é sempre uma Connection; se não for, a checagem falha no
     * try/catch de `check()` e o recurso só fica desligado.
     */
    private function schemaBuilder(): SchemaBuilder
    {
        if (! $this->db instanceof Connection) {
            throw new RuntimeException('Database connection does not expose a schema builder.');
        }

        return $this->db->getSchemaBuilder();
    }

    /** @param callable(): bool $probe */
    private function check(string $cacheKey, callable $probe): bool
    {
        if (isset($this->memo[$cacheKey])) {
            return $this->memo[$cacheKey];
        }

        try {
            if ($this->cache->get($cacheKey)) {
                return $this->memo[$cacheKey] = true;
            }

            $exists = $probe();

            if ($exists) {
                $this->cache->forever($cacheKey, true);
            }

            return $this->memo[$cacheKey] = $exists;
        } catch (Throwable) {
            // Banco fora do ar, credenciais erradas, install em andamento: o tema
            // não é o lugar de estourar por isso — o recurso só fica desligado.
            return $this->memo[$cacheKey] = false;
        }
    }
}
