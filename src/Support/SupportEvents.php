<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Psr\Log\LoggerInterface;
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
 * Singleton (AvocadoServiceProvider): o middleware grava o ator e o gancho do
 * modelo o lê na mesma instância. A checagem da tabela segue a regra do
 * BookmarksSchema (ver SchemaInspector): código novo pelo composer chega antes
 * do `flarum migrate`, e nessa janela gravar ou ler a tabela derrubaria a
 * página do ticket.
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

    /** Quem está agindo neste request (null = visitante ou fora de um request). */
    private ?int $actorId = null;

    public function __construct(
        private readonly SchemaInspector $schema,
        private readonly LoggerInterface $logger,
    ) {
    }

    /** O modelo da extensão existe no autoload (extensão instalada)? */
    public static function ticketModelAvailable(): bool
    {
        return class_exists(self::TICKET_MODEL);
    }

    public function rememberActor(?int $actorId): void
    {
        $this->actorId = $actorId;
    }

    public function actorId(): ?int
    {
        return $this->actorId;
    }

    public function available(): bool
    {
        return $this->schema->hasTable(self::TABLE, self::CACHE_KEY);
    }

    /**
     * Gancho do evento `updated` do SupportTicket: só o status interessa, e só
     * quando ele de fato mudou. Nunca deixa uma falha própria subir — a
     * gravação do ticket já aconteceu e não pode ser desfeita por um log.
     */
    public function onTicketUpdated(Model $ticket): void
    {
        try {
            if (! $ticket->wasChanged('status') || ! $this->available()) {
                return;
            }

            $from = $ticket->getOriginal('status');
            $to = $ticket->getAttribute('status');

            if ($from === $to) {
                return;
            }

            SupportEvent::query()->create([
                'ticket_id'   => (int) $ticket->getKey(),
                'user_id'     => $this->actorId,
                'type'        => SupportEvent::TYPE_STATUS,
                'from_status' => $from === null ? null : (string) $from,
                'to_status'   => $to === null ? null : (string) $to,
                'created_at'  => Carbon::now(),
            ]);
        } catch (Throwable $e) {
            try {
                $this->logger->warning('[avocado] support event not recorded', ['exception' => $e]);
            } catch (Throwable) {
                // sem logger não há mais o que fazer
            }
        }
    }
}
