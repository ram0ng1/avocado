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

namespace Ramon\Avocado\Notification;

use Carbon\Carbon;
use Flarum\Database\AbstractModel;
use Flarum\Discussion\Discussion;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;

/**
 * Lembrete de bookmark: notifica o dono do bookmark sobre a discussão salva.
 * A nota não vai para a notificação (é lida da tabela na página de salvos).
 */
class BookmarkReminderBlueprint implements BlueprintInterface, AlertableInterface
{
    public function __construct(
        public Discussion $discussion,
        public ?int $bookmarkId = null,
        public ?Carbon $remindAt = null,
    ) {
    }

    public function getSubject(): ?AbstractModel
    {
        return $this->discussion;
    }

    public function getFromUser(): ?User
    {
        return null;
    }

    /**
     * O NotificationSyncer casa por tipo, assunto e dados: sem o bookmark e o
     * horário, um lembrete apagaria os de outros usuários na mesma discussão.
     */
    public function getData(): mixed
    {
        if ($this->bookmarkId === null) {
            return null;
        }

        return ['bookmarkId' => $this->bookmarkId, 'remindAt' => $this->remindAt?->toIso8601String()];
    }

    public static function getType(): string
    {
        return 'avocadoBookmarkReminder';
    }

    public static function getSubjectModel(): string
    {
        return Discussion::class;
    }
}
