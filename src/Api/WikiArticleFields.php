<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema;
use Flarum\Database\AbstractModel;
use Illuminate\Database\Eloquent\Model;
use Ramon\Avocado\Model\WikiArticleStyle;
use Ramon\Avocado\Support\WikiStyleSchema;

/**
 * `avocadoWikiStyle` nos artigos do linkrobins/wiki: o design da página do
 * artigo, escolhido pelo autor na tela de criação/edição do wiki
 * (`default` = layout da extensão vestido pelo tema; `manual` = manual de
 * referência, ver less/forum/extensions/Wiki.less).
 *
 * Quem grava é quem passa pelos endpoints de criar/editar do próprio wiki — a
 * extensão já checa `createArticle`/`update` neles. A leitura vem da relação
 * `avocadoStyle`, que os endpoints carregam em lote (extend.php). Sem ela
 * carregada o campo fica FORA da resposta em vez de sair nulo, pelo mesmo
 * motivo do ChangelogFields: um `null` sobrescreveria no store o valor bom.
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
