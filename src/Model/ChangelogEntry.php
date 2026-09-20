<?php

declare(strict_types=1);

namespace Ramon\Avocado\Model;

use Flarum\Database\AbstractModel;
use Flarum\Discussion\Discussion;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela companheira 1:1 com `discussions` com o que uma versão do changelog
 * precisa além do título e do corpo: o número da versão e o tipo de capa
 * (banner colorido a partir das tags ou de uma predefinição, para quem não envia
 * imagem — ver `coverPattern`).
 *
 * A linha só existe enquanto houver algo a guardar — limpar os dois campos a
 * apaga (ver `write`).
 *
 * @property int $discussion_id
 * @property string|null $version
 * @property string|null $cover
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 */
class ChangelogEntry extends AbstractModel
{
    /** Capa automática: do produto até a cor do primeiro tipo. */
    public const COVER_COLOR = 'color';

    /** Predefinições de cores (o front define os pares; aqui só a lista de chaves aceitas). */
    public const COVER_PRESETS = ['sunset', 'ocean', 'forest', 'violet', 'ember', 'slate'];

    /** Máximo de tags que uma capa pode combinar. */
    public const COVER_MAX_TAGS = 5;

    /**
     * Formatos do valor de `cover`: `color`, `preset:<chave>` ou `tags:<id>[,<id>…]`.
     * Guardar ids de tag (e não cores) mantém a capa acompanhando a tag se o
     * admin trocar a cor dela depois.
     */
    public static function coverPattern(): string
    {
        return '/^(?:'.self::COVER_COLOR
            .'|preset:(?:'.implode('|', self::COVER_PRESETS).')'
            .'|tags:\d{1,10}(?:,\d{1,10}){0,'.(self::COVER_MAX_TAGS - 1).'})$/';
    }

    protected $table = 'avocado_changelog_entries';

    protected $primaryKey = 'discussion_id';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = ['discussion_id', 'version', 'cover'];

    protected $casts = [
        'discussion_id' => 'integer',
    ];

    public function discussion(): BelongsTo
    {
        return $this->belongsTo(Discussion::class, 'discussion_id');
    }

    /**
     * Grava só as chaves recebidas e mantém a relação da discussão em dia, para
     * a resposta da própria requisição já sair com o valor novo.
     *
     * @param array{version?: string|null, cover?: string|null} $values
     */
    public static function write(Discussion $discussion, array $values): void
    {
        $entry = static::query()->firstOrNew(['discussion_id' => $discussion->id]);
        $entry->fill($values);

        if ($entry->version === null && $entry->cover === null) {
            if ($entry->exists) {
                $entry->delete();
            }

            $discussion->setRelation('avocadoChangelog', null);

            return;
        }

        $entry->save();
        $discussion->setRelation('avocadoChangelog', $entry);
    }
}
