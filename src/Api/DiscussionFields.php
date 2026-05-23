<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Illuminate\Contracts\Filesystem\Filesystem;

class DiscussionFields
{
    protected Filesystem $disk;

    public function __construct(FilesystemFactory $filesystem)
    {
        // Resolve the disk once per request instead of per attribute read —
        // the getter below runs for every discussion in an Index payload, so
        // calling resolve() inside the closure was repeating container work
        // for every row.
        $this->disk = $filesystem->disk('flarum-assets');
    }

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
                    return $this->disk->url((string) $path);
                }),
        ];
    }
}
