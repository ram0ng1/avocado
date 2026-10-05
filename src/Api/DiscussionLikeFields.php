<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Context;
use Flarum\Api\Resource\DiscussionResource;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Illuminate\Database\ConnectionInterface;

/**
 * Curtidas do primeiro post como atributos da discussão, para o botão de curtir
 * dos cards (ThreadCard) e a pontuação de "populares" da home.
 *
 * O card só precisa de dois números — quantas curtidas e se o visitante é uma
 * delas. Antes eles vinham do post inteiro: `include=firstPost` nas listas (o
 * s9e renderizando o HTML de cada post, mais menções, likers e permissões por
 * post) ou um GET /api/posts a mais depois do boot só para isso. Aqui sai uma
 * consulta agrupada em `post_likes` para a página inteira.
 *
 * Só nas listagens de discussões: no Show o post já vem com as curtidas
 * (default include do flarum/likes), e incluída em outro recurso a discussão
 * não vira card.
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
     * Fase síncrona do getter: enfileira a discussão. O getter adiado só roda
     * depois que todas as linhas do documento passaram aqui (mesmo esquema do
     * heroBuffer do DiscussionFields), então o lote sai completo.
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

            // O lote SUBSTITUI o anterior em vez de somar: cada documento
            // consulta o que serializa, e um resultado de outro documento (outro
            // sub-request do mesmo processo) nunca é reaproveitado — nem fica
            // velho depois de uma curtida no meio do caminho.
            $this->likes = $this->fetch($postIds, $context);
        }

        return $this->likes[(int) $discussion->first_post_id] ?? ['count' => 0, 'liked' => false];
    }

    /**
     * Uma consulta para todos os primeiros posts do documento. A contagem é a
     * mesma do `likesCount` do flarum/likes (countRelation, sem filtro); o
     * "curti" só existe para quem está logado.
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
