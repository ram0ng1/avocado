<?php

declare(strict_types=1);

namespace Ramon\Avocado\Model;

use Flarum\Database\AbstractModel;
use Illuminate\Database\Eloquent\Model;

/**
 * Tabela companheira 1:1 com os artigos do linkrobins/wiki: o design que o
 * autor escolheu para o artigo na tela de criação/edição do wiki.
 *
 * O design padrão não ocupa linha — escolher "Padrão" de novo apaga a que
 * existia (ver `write`). Sem relação de volta para o artigo: o model dele é de
 * outra extensão, que o tema não exige.
 *
 * @property int $article_id
 * @property string $style
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 */
class WikiArticleStyle extends AbstractModel
{
    public const DEFAULT = 'default';

    /** Os designs que um artigo pode ter, o padrão primeiro. */
    public const STYLES = [self::DEFAULT, 'manual'];

    protected $table = 'avocado_wiki_article_styles';

    protected $primaryKey = 'article_id';

    public $incrementing = false;

    protected $keyType = 'int';

    // `write()` põe cada coluna pelo nome; a allowlist de valores é a regex do
    // Api\WikiArticleFields.
    protected $guarded = ['*'];

    protected $casts = [
        'article_id' => 'integer',
    ];

    /**
     * Grava o design do artigo e mantém a relação em dia, para a resposta da
     * própria requisição já sair com o valor novo.
     */
    public static function write(Model $article, string $style): void
    {
        $entry = self::query()->where('article_id', $article->getKey())->first();

        if ($style === self::DEFAULT) {
            $entry?->delete();
            $article->setRelation('avocadoStyle', null);

            return;
        }

        if (! $entry instanceof self) {
            $entry = new self();
            $entry->article_id = (int) $article->getKey();
        }

        $entry->style = $style;
        $entry->save();

        $article->setRelation('avocadoStyle', $entry);
    }
}
