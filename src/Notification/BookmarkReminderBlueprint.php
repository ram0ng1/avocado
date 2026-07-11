<?php

declare(strict_types=1);

namespace Ramon\Avocado\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Discussion\Discussion;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;

/**
 * Lembrete de bookmark: notifica o dono do bookmark sobre a discussão salva.
 * O construtor tipado garante o contrato de subject (CLAUDE.md §46.1); `data`
 * fica null de propósito — a nota é rehidratada da tabela na página de salvos,
 * nunca persistida no payload da notificação (§19).
 */
class BookmarkReminderBlueprint implements BlueprintInterface, AlertableInterface
{
    public function __construct(
        public Discussion $discussion
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

    public function getData(): mixed
    {
        return null;
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
