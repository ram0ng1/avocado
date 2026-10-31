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

namespace Ramon\Avocado\Api;

use Flarum\Api\Context;
use Flarum\Api\Resource\DiscussionResource;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Illuminate\Database\ConnectionInterface;

/**
 * Curtidas do primeiro post como atributos da discussão, para os cards não
 * precisarem de `include=firstPost` (render do post inteiro). Uma consulta
 * agrupada para a página, só nas listagens.
 */
class DiscussionLikeFields
{
    /**
     * Discussões do documento atual esperando a contagem, indexadas por objeto.
     *
     * @var array<int, Discussion>
     */
    private array $buffer = [];

    /**
     * Resultado do último lote, por id do primeiro post.
     *
     * @var array<int, array{count: int, liked: bool}>
     */
    private array $likes = [];

    public function __construct(protected ConnectionInterface $db)
    {
    }

    public function __invoke(): array
    {
        return [
            Schema\Integer::make('avocadoFirstPostLikesCount')
                ->visible(fn (Discussion $discussion, Context $context) => $context->listing(DiscussionResource::class))
                ->get(function (Discussion $discussion, Context $context) {
                    $this->bufferDiscussion($discussion);

                    return fn (): int => $this->likesOf($discussion, $context)['count'];
                }),

            Schema\Boolean::make('avocadoFirstPostLiked')
                ->visible(fn (Discussion $discussion, Context $context) => $context->listing(DiscussionResource::class))
                ->get(function (Discussion $discussion, Context $context) {
                    $this->bufferDiscussion($discussion);

                    return fn (): bool => $this->likesOf($discussion, $context)['liked'];
                }),
        ];
    }

    /**
     * O getter adiado só roda depois de todas as linhas, então o lote sai completo.
     */
    private function bufferDiscussion(Discussion $discussion): void
    {
        if ($discussion->first_post_id) {
            $this->buffer[spl_object_id($discussion)] = $discussion;
        }
    }

    /**
     * @return array{count: int, liked: bool}
     */
    private function likesOf(Discussion $discussion, Context $context): array
    {
        if ($this->buffer !== []) {
            $postIds = array_values(array_unique(array_map(
                fn (Discussion $d) => (int) $d->first_post_id,
                $this->buffer
            )));
            $this->buffer = [];

            // Substitui em vez de somar: um resultado de outro sub-request do mesmo
            // processo nunca é reaproveitado, nem fica velho.
            $this->likes = $this->fetch($postIds, $context);
        }

        return $this->likes[(int) $discussion->first_post_id] ?? ['count' => 0, 'liked' => false];
    }

    /**
     * Mesma contagem do `likesCount` do flarum/likes.
     *
     * @param  list<int> $postIds
     * @return array<int, array{count: int, liked: bool}>
     */
    private function fetch(array $postIds, Context $context): array
    {
        $actor = $context->getActor();
        $actorId = $actor->isGuest() ? 0 : (int) $actor->id;

        $rows = $this->db->table('post_likes')
            ->select('post_id')
            ->selectRaw('count(*) as likes_count')
            ->selectRaw('max(case when user_id = ? then 1 else 0 end) as liked', [$actorId])
            ->whereIn('post_id', $postIds)
            ->groupBy('post_id')
            ->get();

        $out = [];

        foreach ($rows as $row) {
            $out[(int) $row->post_id] = [
                'count' => (int) $row->likes_count,
                'liked' => $actorId !== 0 && (int) $row->liked === 1,
            ];
        }

        return $out;
    }
}
