<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Carbon\Carbon;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Eloquent\Model;
use Ramon\Avocado\Model\SupportEvent;
use Throwable;

/**
 * Linha do tempo dos tickets do linkrobins/support.
 *
 * A extensão troca o status de um ticket em dois caminhos — a barra da equipe
 * (PATCH no ticket) e o gancho de resposta (uma resposta de staff move o ticket
 * para "aguardando resposta", uma do dono para "aberto") — e em nenhum deles
 * guarda histórico: só notifica. O tema observa o evento `updated` do modelo da
 * extensão, que cobre os dois caminhos de uma vez, e grava a mudança com o ator
 * do request (lembrado pelo Middleware\RememberActor, já que um evento de
 * modelo não sabe quem está logado).
 *
 * A checagem da tabela segue a mesma regra do BookmarksSchema: código novo pelo
 * composer chega antes do `flarum migrate`, e nessa janela gravar ou ler a
 * tabela derrubaria a página do ticket.
 */
final class SupportEvents
{
    public const EXTENSION_ID = 'linkrobins-support';

    /**
     * Nomes das classes da extensão como string de propósito: o tema não
     * depende do pacote, então um `::class` não teria o que resolver. O PHPStan
     * não consegue provar que são class-string (a extensão não está no vendor
     * do tema) e as duas linhas do extend.php ficam em ignoreErrors.
     */
    public const TICKET_MODEL = 'LinkRobins\Support\SupportTicket';

    public const TICKET_RESOURCE = 'LinkRobins\Support\Api\Resource\SupportTicketResource';

    public const TABLE = 'avocado_support_events';

    private const CACHE_KEY = 'avocado.support_events_table_exists';

    /** Memo do request; null = ainda não checado. */
    private static ?bool $exists = null;

    /** Quem está agindo neste request (null = visitante ou fora de um request). */
    private static ?int $actorId = null;

    public static function rememberActor(?int $actorId): void
    {
        self::$actorId = $actorId;
    }

    public static function actorId(): ?int
    {
        return self::$actorId;
    }

    /** O modelo da extensão existe no autoload (extensão instalada)? */
    public static function ticketModelAvailable(): bool
    {
        return class_exists(self::TICKET_MODEL);
    }

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
            return self::$exists = false;
        }
    }

    /**
     * Gancho do evento `updated` do SupportTicket: só o status interessa, e só
     * quando ele de fato mudou. Nunca deixa uma falha própria subir — a
     * gravação do ticket já aconteceu e não pode ser desfeita por um log.
     */
    public static function onTicketUpdated(Model $ticket): void
    {
        try {
            if (! $ticket->wasChanged('status') || ! self::available()) {
                return;
            }

            $from = $ticket->getOriginal('status');
            $to = $ticket->getAttribute('status');

            if ($from === $to) {
                return;
            }

            SupportEvent::query()->create([
                'ticket_id'   => (int) $ticket->getKey(),
                'user_id'     => self::$actorId,
                'type'        => SupportEvent::TYPE_STATUS,
                'from_status' => $from === null ? null : (string) $from,
                'to_status'   => $to === null ? null : (string) $to,
                'created_at'  => Carbon::now(),
            ]);
        } catch (Throwable $e) {
            try {
                resolve(\Psr\Log\LoggerInterface::class)->warning('[avocado] support event not recorded', ['exception' => $e]);
            } catch (Throwable) {
                // sem logger não há mais o que fazer
            }
        }
    }

    /** Ponto de teste — zera os memos do request. */
    public static function forget(): void
    {
        self::$exists = null;
        self::$actorId = null;
    }
}
