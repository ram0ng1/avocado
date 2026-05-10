<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;

class DiscussionFields
{
    public function __invoke(): array
    {
        return [
            // Raw filename stored in flarum-assets, e.g. "avocado-disc-hero-12-abcdef.webp".
            Schema\Str::make('heroImagePath')
                ->nullable()
                ->get(fn (Discussion $discussion) => $discussion->avocado_hero_image_path),

            // Fully-resolved public URL — null when the discussion has no image.
            Schema\Str::make('heroImageUrl')
                ->nullable()
                ->get(function (Discussion $discussion): ?string {
                    $path = $discussion->avocado_hero_image_path;
                    if (! $path) {
                        return null;
                    }
                    /** @var FilesystemFactory $factory */
                    $factory = resolve(FilesystemFactory::class);
                    return $factory->disk('flarum-assets')->url((string) $path);
                }),
        ];
    }
}
