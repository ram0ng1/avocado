<?php

declare(strict_types=1);

namespace Ramon\Avocado\Model;

use Flarum\Database\AbstractModel;
use Flarum\Discussion\Discussion;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tabela companheira 1:1 com `discussions` que armazena o caminho da imagem
 * hero (CLAUDE.md §45). Mantemos a chave primária por `discussion_id` para
 * dispensar coluna auto-incremento e tornar o lookup por discussão uma busca
 * direta no índice da PK.
 *
 * @property int $discussion_id
 * @property string $image_path
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 */
class DiscussionHero extends AbstractModel
{
    protected $table = 'avocado_discussion_heroes';

    protected $primaryKey = 'discussion_id';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $guarded = ['discussion_id'];

    protected $casts = [
        'discussion_id' => 'integer',
    ];

    public function discussion(): BelongsTo
    {
        return $this->belongsTo(Discussion::class, 'discussion_id');
    }
}
