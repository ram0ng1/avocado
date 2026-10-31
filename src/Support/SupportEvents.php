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

namespace Ramon\Avocado\Support;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Psr\Log\LoggerInterface;
use Ramon\Avocado\Model\SupportEvent;
use Throwable;

/**
 * Linha do tempo dos tickets do linkrobins/support.
 *
 * A extensão muda o status por dois caminhos e não guarda histórico. O evento
 * `updated` do modelo cobre os dois; o ator vem do Middleware\RememberActor,
 * porque um evento de modelo não sabe quem está logado. Singleton, para os dois
 * lados verem a mesma instância.
 */
final class SupportEvents
{
    public const EXTENSION_ID = 'linkrobins-support';

    /**
     * Como string: o tema não depende do pacote. Por isso o PHPStan não as prova
     * como class-string, e o extend.php tem duas linhas em ignoreErrors.
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
     * Nunca deixa uma falha própria subir: o ticket já foi gravado.
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
