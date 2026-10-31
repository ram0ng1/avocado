<?php

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
     * O NotificationSyncer casa as notificações por tipo, assunto e dados: sem
     * o bookmark e o horário, o lembrete de um usuário apagava os dos outros na
     * mesma discussão, e um lembrete novo não gerava alerta novo.
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
