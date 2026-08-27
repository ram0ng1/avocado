<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Context;
use Flarum\Api\Resource\EloquentBuffer;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Flarum\Post\CommentPost;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Illuminate\Contracts\Filesystem\Filesystem;
use Ramon\Avocado\Model\DiscussionHero;
use s9e\TextFormatter\Utils;

class DiscussionFields
{
    /**
     * Teto do excerpt no fio. O card corta em ~140–160; a folga cobre a
     * truncagem por palavra do front sem mandar o post inteiro.
     */
    private const EXCERPT_LENGTH = 300;

    protected Filesystem $disk;

    /**
     * Discussões do documento atual esperando o hero, indexadas por objeto.
     * Esvaziada no primeiro getter adiado que precisar do dado.
     *
     * @var array<int, Discussion>
     */
    private array $heroBuffer = [];

    public function __construct(FilesystemFactory $filesystem)
    {
        // Resolve o disco uma vez por request em vez de por leitura de atributo
        // — o getter abaixo executa para cada discussão num payload de Index,
        // então chamar resolve() dentro do closure repetia trabalho de container
        // para cada linha.
        $this->disk = $filesystem->disk('flarum-assets');
    }

    public function __invoke(): array
    {
        return [
            // Caminho bruto guardado em flarum-assets, ex. "avocado-disc-hero-12-abcdef.webp".
            Schema\Str::make('heroImagePath')
                ->nullable()
                ->get(function (Discussion $discussion) {
                    $this->bufferHero($discussion);

                    return fn (): ?string => $this->resolvePath($discussion);
                }),

            // URL pública resolvida — null quando a discussão não tem imagem.
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
            // Os cards do tema (showcase e ThreadCard) mostram a descrição da
            // discussão e uma imagem de capa. Os dois saíam de
            // `discussion.firstPost().contentPlain()` no front — e desde a série
            // 2.0 RC o Index não manda mais o post no `included`, só o linkage:
            // resultado, card sem descrição e sem capa (issue #199).
            //
            // Buscar o post depois no cliente resolveria com flash; incluir o
            // post no boot custa o render do s9e para a página inteira. Estes
            // dois campos leem o XML já armazenado — sem render, sem callback de
            // extensão, sem policy por post — e viajam no mesmo apiDocument do
            // boot, então o primeiro paint já sai completo.
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
        ];
    }

    /**
     * O primeiro post da discussão, resolvido pelo buffer de relações: uma
     * consulta para a página inteira em vez de uma por linha (sem N+1). O
     * `add()` acontece na fase síncrona do getter e o `load()` aqui, já na fase
     * adiada, quando todas as discussões do documento estão enfileiradas.
     */
    private function firstPost(Discussion $discussion, Context $context): ?CommentPost
    {
        if (! $discussion->relationLoaded('firstPost')) {
            // A relação é procurada na resource de discussões, não em
            // `$context->collection`: quando a discussão é serializada como
            // recurso *incluído* (de um /posts, por exemplo) a collection do
            // request é outra e o buffer cairia no caminho agregado.
            $resource = $context->api->getResource('discussions');

            /** @var Schema\Relationship\ToOne|null $relationship */
            $relationship = collect($context->fields($resource))->first(fn ($field) => $field->name === 'firstPost');

            EloquentBuffer::load($discussion, 'firstPost', $relationship, $context);
        }

        // Se mesmo assim a relação não veio (o buffer já tinha sido consumido
        // por outro campo neste documento), cai no lazy-load em vez de estourar.
        $post = $discussion->relationLoaded('firstPost')
            ? $discussion->getRelation('firstPost')
            : $discussion->firstPost;

        return $post instanceof CommentPost ? $post : null;
    }

    /**
     * Texto puro do primeiro post, na mesma forma que o front produzia com
     * `getPlainContent(contentHtml)`: sem citações e sem as URLs cruas das
     * imagens (que o `removeFormatting` devolveria como texto).
     */
    private function excerpt(?CommentPost $post): ?string
    {
        if ($post === null || empty($post->parsed_content)) {
            return null;
        }

        $xml = preg_replace('#<(QUOTE|IMG|UPL-IMAGE-PREVIEW)\b.*?</\1>#is', '', $post->parsed_content) ?? $post->parsed_content;
        $xml = preg_replace('#<(IMG|UPL-IMAGE-PREVIEW)\b[^>]*/?>#i', '', $xml) ?? $xml;

        $plain = trim(preg_replace('/\s+/', ' ', Utils::removeFormatting($xml)) ?? '');

        return $plain === '' ? null : mb_substr($plain, 0, self::EXCERPT_LENGTH);
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
     * Enfileira a discussão para o carregamento em lote do hero.
     *
     * Roda na fase síncrona do getter, quando o serializador ainda está
     * percorrendo as linhas do documento; o `resolvePath` adiado só corre
     * depois que todas passaram por aqui, então a fila já está completa.
     *
     * O `EloquentBuffer` do core não serve: ele exige o objeto Relationship do
     * schema JSON:API para montar o escopo, e `avocadoHero` é uma relação
     * interna (vira atributo, não relacionamento exposto) — sem ele o buffer
     * desvia para o caminho de agregação e estoura.
     */
    private function bufferHero(Discussion $discussion): void
    {
        if ($discussion->exists && ! $discussion->relationLoaded('avocadoHero')) {
            $this->heroBuffer[spl_object_id($discussion)] = $discussion;
        }
    }

    /**
     * Caminho do hero da discussão, em uma consulta para o documento inteiro.
     *
     * No Index/Show o endpoint já faz `eagerLoad('avocadoHero')` (extend.php) e
     * aqui só se lê memória. A fila cobre o outro caso: discussão serializada
     * como recurso INCLUÍDO — /api/posts, notificações — onde não há eager-load
     * do endpoint e ler a relação direto disparava um SELECT em
     * `avocado_discussion_heroes` por discussão do payload (N+1).
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
