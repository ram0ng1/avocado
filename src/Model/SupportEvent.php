<?php

declare(strict_types=1);

namespace Ramon\Avocado\Model;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Um evento na linha do tempo de um ticket do linkrobins/support — hoje só a
 * mudança de status (`type` = 'status'), gravada por Support\SupportEvents.
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
