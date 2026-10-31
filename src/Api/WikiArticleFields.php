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
use Flarum\Database\AbstractModel;
use Illuminate\Database\Eloquent\Model;
use Ramon\Avocado\Model\WikiArticleStyle;
use Ramon\Avocado\Support\WikiStyleSchema;

/**
 * Design do artigo do linkrobins/wiki. A permissão de escrita já é checada
 * pelos endpoints do wiki. Sem a relação carregada o campo fica fora da
 * resposta: um `null` sobrescreveria no store o valor bom.
 */
class WikiArticleFields
{
    public function __construct(
        protected WikiStyleSchema $schema
    ) {
    }

    /** @return list<Schema\Attribute> */
    public function __invoke(): array
    {
        // O 1º argumento é o model na serialização e o próprio Context fora dela.
        $visible = fn (mixed $model = null): bool => $this->schema->available()
            && (! $model instanceof Model || $model->relationLoaded('avocadoStyle'));

        return [
            Schema\Str::make('avocadoWikiStyle')
                ->visible($visible)
                ->writable(fn (): bool => $this->schema->available())
                ->regex('/^(?:'.implode('|', WikiArticleStyle::STYLES).')$/')
                ->get(static function (Model $article): string {
                    $entry = $article->relationLoaded('avocadoStyle') ? $article->getRelation('avocadoStyle') : null;

                    return $entry instanceof WikiArticleStyle ? $entry->style : WikiArticleStyle::DEFAULT;
                })
                ->set(static function (AbstractModel $article, string $value): void {
                    // Depois do save: num artigo novo ainda não há id para a linha.
                    $article->afterSave(static fn (AbstractModel $saved) => WikiArticleStyle::write($saved, $value));
                }),
        ];
    }
}
