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

use DOMDocument;
use DOMXPath;
use Flarum\Api\Context;
use Flarum\Api\Resource\DiscussionResource;
use Flarum\Api\Resource\EloquentBuffer;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Flarum\Post\CommentPost;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Illuminate\Contracts\Filesystem\Cloud;
use Ramon\Avocado\Model\DiscussionHero;

class DiscussionFields
{
    /**
     * Teto do excerpt no fio. O card corta em ~140–160; a folga cobre a
     * truncagem por palavra do front sem mandar o post inteiro.
     */
    private const EXCERPT_LENGTH = 300;

    /** O cartão de resposta do card corta em 100; a folga cobre a truncagem por palavra. */
    private const LAST_POST_EXCERPT_LENGTH = 200;

    protected Cloud $disk;

    /**
     * Discussões do documento esperando o hero; esvaziada pelo primeiro getter adiado.
     *
     * @var array<int, Discussion>
     */
    private array $heroBuffer = [];

    public function __construct(FilesystemFactory $filesystem)
    {
        // Resolvido uma vez: o getter roda para cada discussão do Index.
        $this->disk = $filesystem->disk('flarum-assets');
    }

    public function __invoke(): array
    {
        return [
            Schema\Str::make('heroImagePath')
                ->nullable()
                ->get(function (Discussion $discussion) {
                    $this->bufferHero($discussion);

                    return fn (): ?string => $this->resolvePath($discussion);
                }),

            Schema\Str::make('heroImageUrl')
                ->nullable()
                ->get(function (Discussion $discussion) {
                    $this->bufferHero($discussion);

                    return function () use ($discussion): ?string {
                        $path = $this->resolvePath($discussion);

                        return $path ? $this->disk->url($path) : null;
                    };
                }),

            // ── Resumo e capa do primeiro post ────────────────────────────────
            // O Index do Flarum 2 não inclui mais o primeiro post. Ler o XML guardado
            // evita o render do s9e e chega no mesmo payload do boot, sem flash.
            Schema\Str::make('avocadoExcerpt')
                ->nullable()
                ->get(function (Discussion $discussion, Context $context) {
                    EloquentBuffer::add($discussion, 'firstPost');

                    return fn (): ?string => $this->excerpt($this->firstPost($discussion, $context));
                }),

            Schema\Str::make('avocadoFirstImageUrl')
                ->nullable()
                ->get(function (Discussion $discussion, Context $context) {
                    EloquentBuffer::add($discussion, 'firstPost');

                    return fn (): ?string => $this->firstImage($this->firstPost($discussion, $context));
                }),

            // ── Resumo da última resposta ─────────────────────────────────────
            // Lê o XML guardado para as listas não precisarem de `include=lastPost`,
            // que renderiza um post inteiro por card. Só no Index e no Show (refetch do realtime).
            Schema\Str::make('avocadoLastPostExcerpt')
                ->nullable()
                ->visible(fn (Discussion $discussion, Context $context) => $context->listing(DiscussionResource::class) || $context->showing(DiscussionResource::class))
                ->get(function (Discussion $discussion, Context $context) {
                    if ((int) $discussion->comment_count <= 1 || ! $discussion->last_post_id) {
                        return null;
                    }

                    EloquentBuffer::add($discussion, 'lastPost');

                    return function () use ($discussion, $context): ?string {
                        $post = $this->bufferedPost($discussion, 'lastPost', $context);

                        return $post === null || empty($post->parsed_content)
                            ? null
                            : $this->plainExcerpt($post->parsed_content, self::LAST_POST_EXCERPT_LENGTH);
                    };
                }),
        ];
    }

    /**
     * Pelo buffer de relações: uma consulta para o documento inteiro, já que o
     * `load()` só roda na fase adiada, com todas as discussões enfileiradas.
     */
    private function firstPost(Discussion $discussion, Context $context): ?CommentPost
    {
        return $this->bufferedPost($discussion, 'firstPost', $context);
    }

    /**
     * `firstPost`/`lastPost` pelo buffer de relações, com o escopo (visibilidade)
     * da relação no schema de discussões.
     */
    private function bufferedPost(Discussion $discussion, string $relation, Context $context): ?CommentPost
    {
        if (! $discussion->relationLoaded($relation)) {
            // Da resource de discussões, não de `$context->collection`: num recurso
            // incluído (de um /posts) a collection é outra e o buffer cairia no caminho agregado.
            $resource = $context->api->getResource('discussions');

            /** @var Schema\Relationship\ToOne|null $relationship */
            $relationship = collect($context->fields($resource))->first(fn ($field) => $field->name === $relation);

            EloquentBuffer::load($discussion, $relation, $relationship, $context);
        }

        // Se mesmo assim a relação não veio (o buffer já tinha sido consumido
        // por outro campo neste documento), cai no lazy-load em vez de estourar.
        $post = $discussion->relationLoaded($relation)
            ? $discussion->getRelation($relation)
            : $discussion->{$relation};

        return $post instanceof CommentPost ? $post : null;
    }

    /**
     * Texto puro, como o `getPlainContent()` do front: sem citações nem URLs de imagem.
     */
    private function excerpt(?CommentPost $post): ?string
    {
        if ($post === null || empty($post->parsed_content)) {
            return null;
        }

        return $this->plainExcerpt($post->parsed_content);
    }

    /**
     * Reduz o XML do s9e a texto corrido. No DOM e não por regex: com `<QUOTE>`
     * aninhado a regex deixaria um fechamento órfão e o XML não carregaria mais.
     */
    private function plainExcerpt(string $xml, int $length = self::EXCERPT_LENGTH): ?string
    {
        if (trim($xml) === '') {
            return null;
        }

        $dom = new DOMDocument();

        // XML corrompido deixa o card sem descrição em vez de estourar 500.
        $internal = libxml_use_internal_errors(true);
        $loaded = $dom->loadXML($xml, LIBXML_COMPACT | LIBXML_PARSEHUGE);
        libxml_clear_errors();
        libxml_use_internal_errors($internal);

        if (! $loaded || $dom->documentElement === null) {
            return null;
        }

        $xpath = new DOMXPath($dom);

        // Citações e imagens saem inteiras, trocadas por um espaço: retirar o
        // nó sem separador colaria o texto vizinho ("antes<IMG/>depois").
        foreach ($xpath->query('//QUOTE | //IMG | //UPL-IMAGE-PREVIEW') as $node) {
            $node->parentNode?->replaceChild($dom->createTextNode(' '), $node);
        }

        // Menções guardam a sintaxe crua (`@"Fulano"#p12`); o resumo mostra só o nome,
        // como o post renderizado.
        $mentions = [
            'POSTMENTION'  => ['', 'displayname'],
            'USERMENTION'  => ['@', 'displayname'],
            'GROUPMENTION' => ['@', 'groupname'],
            'TAGMENTION'   => ['', 'tagname'],
        ];

        foreach ($mentions as $tag => [$prefix, $attribute]) {
            /** @var \DOMElement $node */
            foreach ($xpath->query('//'.$tag) as $node) {
                $name = $node->getAttribute($attribute);

                if ($name !== '') {
                    $node->parentNode?->replaceChild($dom->createTextNode($prefix.$name), $node);
                }
            }
        }

        // `e`/`s` são a marcação em si (os `**` do negrito, o `>` da citação):
        // saem sem espaço, senão partiriam a palavra que estavam decorando.
        foreach ($xpath->query('//e | //s') as $node) {
            $node->parentNode?->removeChild($node);
        }

        $plain = trim(preg_replace('/\s+/', ' ', $dom->documentElement->textContent) ?? '');

        return $plain === '' ? null : mb_substr($plain, 0, $length);
    }

    /**
     * Primeira imagem do post, usada como capa quando a discussão não tem hero
     * próprio. Só http(s) e caminho absoluto passam — `javascript:` e `data:`
     * chegariam a um `src` renderizado.
     */
    private function firstImage(?CommentPost $post): ?string
    {
        if ($post === null || empty($post->parsed_content)) {
            return null;
        }

        if (! preg_match('/<(?:IMG|UPL-IMAGE-PREVIEW)\b[^>]*\b(?:src|url)="([^"]*)"/i', $post->parsed_content, $matches)) {
            return null;
        }

        $url = trim(htmlspecialchars_decode($matches[1], ENT_QUOTES));

        return preg_match('#^(https?://|/)#i', $url) === 1 ? $url : null;
    }

    /**
     * Fase síncrona do getter: o `resolvePath` adiado só corre depois de todas as
     * linhas, então a fila já está completa. O `EloquentBuffer` do core não serve:
     * exige uma relação exposta no schema, e `avocadoHero` é interna.
     */
    private function bufferHero(Discussion $discussion): void
    {
        if ($discussion->exists && ! $discussion->relationLoaded('avocadoHero')) {
            $this->heroBuffer[spl_object_id($discussion)] = $discussion;
        }
    }

    /**
     * No Index/Show a relação já vem eager-carregada. A fila cobre a discussão
     * incluída em outro recurso (/api/posts, notificações), que sem ela faria N+1.
     */
    private function resolvePath(Discussion $discussion): ?string
    {
        if ($this->heroBuffer !== []) {
            $pending = array_values($this->heroBuffer);
            $this->heroBuffer = [];

            $discussion->newCollection($pending)->load('avocadoHero');
        }

        /** @var DiscussionHero|null $hero */
        $hero = $discussion->relationLoaded('avocadoHero')
            ? $discussion->getRelation('avocadoHero')
            : $discussion->avocadoHero;

        return $hero?->image_path;
    }
}
