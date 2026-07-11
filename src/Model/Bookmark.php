<?php

declare(strict_types=1);

namespace Ramon\Avocado\Model;

use Flarum\Database\AbstractModel;
use Flarum\Discussion\Discussion;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Um bookmark: o par (usuário, discussão) que marca uma discussão como salva.
 * Tabela companheira de `discussions`/`users` (CLAUDE.md §45). O par é único
 * via índice na migração; a escrita acontece por insertOrIgnore/delete no
 * controller, então o `id` auto-incremento existe só para manter o Eloquent
 * confortável — nunca o usamos para lookup.
 *
 * @property int $id
 * @property int $user_id
 * @property int $discussion_id
 * @property string|null $note
 * @property \Carbon\Carbon|null $remind_at
 * @property \Carbon\Carbon|null $reminder_sent_at
 * @property \Carbon\Carbon|null $created_at
 */
class Bookmark extends AbstractModel
{
    protected $table = 'avocado_bookmarks';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'user_id'          => 'integer',
        'discussion_id'    => 'integer',
        'created_at'       => 'datetime',
        'remind_at'        => 'datetime',
        'reminder_sent_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function discussion(): BelongsTo
    {
        return $this->belongsTo(Discussion::class, 'discussion_id');
    }
}
