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

use Flarum\Api\Schema;
use Flarum\Tags\Tag;
use Ramon\Avocado\Support\SvgIconSanitizer;
use Ramon\Avocado\Support\TagIconSvg;
use Ramon\Avocado\Support\ValidSvgIcon;

/**
 * Ícone SVG da tag. O SVG é sanitizado na entrada, então o que está no banco já
 * pode ser embutido no HTML. Com o recurso desligado (switch ou colunas
 * ausentes) os campos saem do payload e não aceitam escrita.
 */
class TagIconSvgFields
{
    public function __construct(
        protected TagIconSvg $tagIconSvg,
        protected ValidSvgIcon $validSvgIcon,
    ) {
    }

    /** @return list<Schema\Attribute> */
    public function __invoke(): array
    {
        $active = fn (): bool => $this->tagIconSvg->enabled();
        $scalable = fn (): bool => $this->tagIconSvg->enabled() && $this->tagIconSvg->scaleAvailable();

        return [
            Schema\Str::make('iconSvg')
                ->property('icon_svg')
                ->visible($active)
                ->writable($active)
                ->nullable()
                ->rule(fn () => $this->validSvgIcon)
                ->set(function (Tag $tag, ?string $value): void {
                    // setAttribute em vez de `$tag->icon_svg`: a coluna é do tema,
                    // não da classe Tag, e o phpstan (com razão) não a conhece.
                    $tag->setAttribute('icon_svg', ($value === null || trim($value) === '')
                        ? null
                        : SvgIconSanitizer::sanitize($value));
                }),

            Schema\Boolean::make('iconSvgMono')
                ->property('icon_svg_mono')
                ->visible($active)
                ->writable($active),

            // Em % do glifo. Só redimensiona o desenho (transform no CSS): a caixa
            // do ícone continua 1em, então o layout em volta não se mexe.
            Schema\Integer::make('iconSvgScale')
                ->property('icon_svg_scale')
                ->visible($scalable)
                ->writable($scalable)
                ->min(TagIconSvg::SCALE_MIN)
                ->max(TagIconSvg::SCALE_MAX),
        ];
    }
}
