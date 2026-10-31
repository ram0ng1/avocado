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

namespace Ramon\Avocado\Controller;

use Flarum\Discussion\Discussion;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Flarum\Locale\TranslatorInterface;
use Illuminate\Contracts\Filesystem\Factory;
use Illuminate\Contracts\Filesystem\Cloud;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Intervention\Image\ImageManager;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\Avocado\Model\DiscussionHero;

class UploadDiscussionHeroController implements RequestHandlerInterface
{
    protected Cloud $uploadDir;

    public function __construct(
        protected ImageManager $imageManager,
        Factory $filesystemFactory,
        protected TranslatorInterface $translator,
    ) {
        $this->uploadDir = $filesystemFactory->disk('flarum-assets');
    }

    /** Recusado antes de o decodificador rodar. */
    private const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

    /**
     * Teto em pixels, conferido no cabeçalho antes de decodificar: o GD aloca o
     * bitmap fora do memory_limit, e um PNG de 1 MB pode declarar 20000×20000.
     */
    private const MAX_PIXELS = 40_000_000;

    private const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $rawId = Arr::get($request->getQueryParams(), 'discussionId');
        $discussionId = filter_var($rawId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($discussionId === false) {
            throw new ValidationException(['discussionId' => $this->translator->trans('ramon-avocado.api.invalid_discussion_id')]);
        }

        /** @var Discussion|null $discussion */
        // Só discussões visíveis ao ator: senão a diferença entre 404 e 403 revelaria
        // quais IDs ocultos existem.
        $discussion = Discussion::whereVisibleTo($actor)->find($discussionId);
        if (! $discussion) {
            throw new ValidationException(['discussionId' => $this->translator->trans('ramon-avocado.api.discussion_not_found')]);
        }

        // Ability própria em vez de `rename`; ver Access\DiscussionPolicy.
        $actor->assertCan('uploadHeroImage', $discussion);

        $file = Arr::get($request->getUploadedFiles(), 'avocado-discussion-hero');
        if (! $file) {
            throw new ValidationException(['file' => $this->translator->trans('ramon-avocado.api.no_file_uploaded')]);
        }

        // Recusa antes de o Intervention decodificar o bitmap (OOM/DoS).
        $size = $file->getSize();
        if ($size === null || $size > self::MAX_UPLOAD_BYTES) {
            throw new ValidationException([
                'file' => $this->translator->trans('ramon-avocado.api.file_too_large', ['max' => '8 MB']),
            ]);
        }

        // O Content-Type do cliente não vale: o MIME é detectado no disco pelo finfo.
        $tmpPath = $file->getStream()->getMetadata('uri');
        $mime = '';
        if (is_string($tmpPath) && is_readable($tmpPath)) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo !== false) {
                $detected = finfo_file($finfo, $tmpPath);
                finfo_close($finfo);
                if (is_string($detected)) {
                    $mime = $detected;
                }
            }
        }
        if (! in_array($mime, self::ALLOWED_MIMES, true)) {
            throw new ValidationException(['file' => $this->translator->trans('ramon-avocado.api.unsupported_image_type')]);
        }

        $dimensions = @getimagesize($tmpPath);
        if (! $dimensions || $dimensions[0] * $dimensions[1] > self::MAX_PIXELS) {
            throw new ValidationException(['file' => $this->translator->trans('ramon-avocado.api.image_too_large')]);
        }

        // O hero é estático: decodificar todos os quadros de um GIF/WebP animado
        // só custa memória (cada quadro vira um bitmap inteiro).
        $encoded = ImageManager::withDriver($this->imageManager->driver()::class, decodeAnimation: false)
            ->read($tmpPath)
            ->scaleDown(width: 1600)
            ->toWebp(quality: 78);

        $filename = 'avocado-disc-hero-'.$discussion->id.'-'.Str::lower(Str::random(8)).'.webp';
        $this->uploadDir->put($filename, $encoded->toString());

        // O lock na linha da discussão serializa uploads simultâneos: sem ele os dois
        // criariam o hero (500 na PK) e um arquivo ficaria órfão. O antigo só sai
        // depois que a linha aponta para o novo.
        $oldPath = $discussion->getConnection()->transaction(function () use ($discussion, $filename) {
            Discussion::query()->whereKey($discussion->id)->lockForUpdate()->value('id');

            /** @var DiscussionHero|null $hero */
            $hero = DiscussionHero::query()->find($discussion->id);
            $oldPath = $hero?->image_path;

            if ($hero === null) {
                $hero = new DiscussionHero();
                $hero->discussion_id = (int) $discussion->id;
            }
            $hero->image_path = $filename;
            $hero->save();

            return $oldPath;
        });

        if ($oldPath && $oldPath !== $filename && $this->uploadDir->exists($oldPath)) {
            $this->uploadDir->delete($oldPath);
        }

        return new JsonResponse([
            'discussionId'   => (string) $discussion->id,
            'heroImagePath'  => $filename,
            'heroImageUrl'   => $this->uploadDir->url($filename),
        ]);
    }
}
