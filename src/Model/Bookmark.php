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

namespace Ramon\Avocado\Model;

use Flarum\Database\AbstractModel;
use Flarum\Discussion\Discussion;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Par único (usuário, discussão) de uma discussão salva. O `id` existe só para o
 * Eloquent; a escrita é por insertOrIgnore/delete no par.
 *
 * @property int $id
 * @property int $user_id
 * @property int $discussion_id
 * @property string|null $note
 * @property \Carbon\Carbon|null $remind_at
 * @property \Carbon\Carbon|null $reminder_sent_at
 * @property \Carbon\Carbon|null $created_at
 * @property-read User|null $user
 * @property-read Discussion|null $discussion
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
