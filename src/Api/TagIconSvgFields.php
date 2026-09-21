<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\Tags\Tag;
use Ramon\Avocado\Support\SvgIconSanitizer;
use Ramon\Avocado\Support\TagIconSvg;
use Ramon\Avocado\Support\ValidSvgIcon;

/**
 * Os atributos extras do TagResource. O SVG é sanitizado na entrada, então
 * o que chega ao banco já é seguro para embutir no HTML.
 *
 * Com o recurso desligado (switch ou colunas ausentes) os campos saem do
 * payload e deixam de aceitar escrita — o front só os lê quando o flag do forum
 * está ligado, então não há por que carregar 100 KB de SVG por tag à toa.
 *
 * O tamanho (`iconSvgScale`) tem coluna própria, de uma migration posterior: sem
 * ela só esse campo fica de fora, e o front desenha o ícone em 100%.
 */
class TagIconSvgFields
{
    public function __construct(
        protected SettingsRepositoryInterface $settings
    ) {
    }

    /** @return list<Schema\Attribute> */
    public function __invoke(): array
    {
        $active = fn (): bool => TagIconSvg::enabled($this->settings);
        $scalable = fn (): bool => TagIconSvg::enabled($this->settings) && TagIconSvg::scaleAvailable();

        return [
            Schema\Str::make('iconSvg')
                ->property('icon_svg')
                ->visible($active)
                ->writable($active)
                ->nullable()
                ->rule(fn () => resolve(ValidSvgIcon::class))
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
