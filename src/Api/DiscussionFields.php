<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Illuminate\Contracts\Filesystem\Filesystem;
use Ramon\Avocado\Model\DiscussionHero;

class DiscussionFields
{
    protected Filesystem $disk;

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
                ->get(fn (Discussion $discussion) => $this->resolvePath($discussion)),

            // URL pública resolvida — null quando a discussão não tem imagem.
            Schema\Str::make('heroImageUrl')
                ->nullable()
                ->get(function (Discussion $discussion): ?string {
                    $path = $this->resolvePath($discussion);
                    if (! $path) {
                        return null;
                    }
                    return $this->disk->url($path);
                }),
        ];
    }

    private function resolvePath(Discussion $discussion): ?string
    {
        /** @var DiscussionHero|null $hero */
        $hero = $discussion->avocadoHero;
        return $hero?->image_path;
    }
}
