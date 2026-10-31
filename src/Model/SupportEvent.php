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
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Evento na linha do tempo de um ticket do linkrobins/support (por ora só
 * `type` = 'status'), gravado por Support\SupportEvents.
 *
 * @property int $id
 * @property int $ticket_id
 * @property int|null $user_id
 * @property string $type
 * @property string|null $from_status
 * @property string|null $to_status
 * @property \Carbon\Carbon|null $created_at
 * @property-read User|null $user
 */
class SupportEvent extends AbstractModel
{
    public const TYPE_STATUS = 'status';

    protected $table = 'avocado_support_events';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'ticket_id'  => 'integer',
        'user_id'    => 'integer',
        'created_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
