<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Flarum\Locale\TranslatorInterface;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\Exception\PermissionDeniedException;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Avocado\Model\Bookmark;
use Ramon\Avocado\Support\BookmarksSetting;

/**
 * Define nota e/ou lembrete do bookmark do ator (upsert: salva a discussão se
 * ainda não estava salva). O par é sempre derivado do servidor (user_id = ator,
 * §7) e a discussão precisa ser visível ao ator (§5). Trocar o lembrete zera
 * `reminder_sent_at`, rearmando o envio pelo scheduler.
 */
class UpdateBookmarkController implements RequestHandlerInterface
{
    public const NOTE_MAX_LENGTH = 1000;

    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected TranslatorInterface $translator,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        if (! BookmarksSetting::enabled($this->settings)) {
            throw new PermissionDeniedException();
        }

        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $body = (array) ($request->getParsedBody() ?? []);
        $discussion = $this->resolveDiscussion($body, $request, $actor);

        $note = $this->parseNote($body);
        $remindAt = $this->parseRemindAt($body);

        /** @var Bookmark $bookmark */
        $bookmark = Bookmark::query()->firstOrNew([
            'user_id'       => (int) $actor->id,
            'discussion_id' => (int) $discussion->id,
        ]);

        if (! $bookmark->exists) {
            $bookmark->created_at = Carbon::now();
        }

        if (array_key_exists('note', $body)) {
            $bookmark->note = $note;
        }

        if (array_key_exists('remindAt', $body)) {
            $bookmark->remind_at = $remindAt;
            $bookmark->reminder_sent_at = null;
        }

        $bookmark->save();

        return new JsonResponse([
            'discussionId' => (string) $discussion->id,
            'bookmarked'   => true,
            'note'         => $bookmark->note,
            'remindAt'     => $bookmark->remind_at?->toIso8601String(),
        ]);
    }

    private function resolveDiscussion(array $body, ServerRequestInterface $request, $actor): Discussion
    {
        $rawId = Arr::get($body, 'discussionId', Arr::get($request->getQueryParams(), 'discussionId'));

        $discussionId = filter_var($rawId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($discussionId === false) {
            throw new ValidationException(['discussionId' => $this->translator->trans('ramon-avocado.api.invalid_discussion_id')]);
        }

        /** @var Discussion|null $discussion */
        $discussion = Discussion::whereVisibleTo($actor)->find($discussionId);
        if (! $discussion) {
            throw new ValidationException(['discussionId' => $this->translator->trans('ramon-avocado.api.discussion_not_found')]);
        }

        return $discussion;
    }

    private function parseNote(array $body): ?string
    {
        $raw = Arr::get($body, 'note');
        if ($raw === null) {
            return null;
        }
        if (! is_string($raw)) {
            throw new ValidationException(['note' => $this->translator->trans('ramon-avocado.api.invalid_note')]);
        }

        $note = trim($raw);
        if ($note === '') {
            return null;
        }
        if (mb_strlen($note) > self::NOTE_MAX_LENGTH) {
            throw new ValidationException(['note' => $this->translator->trans('ramon-avocado.api.note_too_long')]);
        }

        return $note;
    }

    private function parseRemindAt(array $body): ?Carbon
    {
        $raw = Arr::get($body, 'remindAt');
        if ($raw === null || $raw === '') {
            return null;
        }
        if (! is_string($raw)) {
            throw new ValidationException(['remindAt' => $this->translator->trans('ramon-avocado.api.invalid_reminder_date')]);
        }

        try {
            $remindAt = Carbon::parse($raw);
        } catch (\Throwable) {
            throw new ValidationException(['remindAt' => $this->translator->trans('ramon-avocado.api.invalid_reminder_date')]);
        }

        if ($remindAt->isPast()) {
            throw new ValidationException(['remindAt' => $this->translator->trans('ramon-avocado.api.reminder_must_be_future')]);
        }
        if ($remindAt->greaterThan(Carbon::now()->addYear())) {
            throw new ValidationException(['remindAt' => $this->translator->trans('ramon-avocado.api.reminder_too_far')]);
        }

        return $remindAt;
    }
}
