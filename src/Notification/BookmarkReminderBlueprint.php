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
     * O horário do lembrete diferencia cada um: o NotificationSyncer casa as
     * notificações por tipo, assunto e dados, e sem isso o lembrete de um
     * usuário apagava os dos outros na mesma discussão.
     */
    public function getData(): mixed
    {
        return $this->remindAt ? ['remindAt' => $this->remindAt->toIso8601String()] : null;
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
