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

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Ramon\Avocado\Model\ChangelogEntry;
use Ramon\Avocado\Support\ChangelogSchema;

/**
 * Versão e capa de uma entrada do changelog. Grava quem pode criar ou renomear
 * a discussão, como o `title` do core.
 *
 * Sem a relação carregada (discussão `included` em outro endpoint) os campos
 * ficam fora da resposta: um `null` sobrescreveria no store do front o valor
 * que o Show/Index acabou de entregar.
 */
class ChangelogFields
{
    /** Espelha CHANGELOG_VERSION_PATTERN em forum/utils. */
    private const VERSION_PATTERN = '/^[0-9A-Za-z][0-9A-Za-z .+_\-]*$/';

    public function __construct(
        protected ChangelogSchema $schema
    ) {
    }

    /** @return list<Schema\Attribute> */
    public function __invoke(): array
    {
        $writable = fn (Discussion $discussion, Context $context): bool => $this->schema->available()
            && ($context->creating() || $context->getActor()->can('rename', $discussion));

        // O 1º argumento é o model quando há um no contexto (serialização) e o próprio
        // Context quando não há. `write()` deixa a relação posta, então a resposta de
        // um create/patch que mexe nos campos já sai com eles.
        $visible = fn (mixed $model = null): bool => $this->schema->available()
            && (! $model instanceof Discussion || $model->relationLoaded('avocadoChangelog'));

        return [
            Schema\Str::make('changelogVersion')
                ->nullable()
                ->visible($visible)
                ->writable($writable)
                ->maxLength(32)
                ->regex(self::VERSION_PATTERN)
                ->get(static fn (Discussion $discussion): ?string => self::entry($discussion)?->version)
                ->set(static function (Discussion $discussion, ?string $value): void {
                    $version = $value === null ? '' : trim($value);

                    $discussion->afterSave(static fn (Discussion $saved) => ChangelogEntry::write($saved, [
                        'version' => $version === '' ? null : $version,
                    ]));
                }),

            Schema\Str::make('changelogCover')
                ->nullable()
                ->visible($visible)
                ->writable($writable)
                ->maxLength(64)
                ->regex(ChangelogEntry::coverPattern())
                ->get(static fn (Discussion $discussion): ?string => self::entry($discussion)?->cover)
                ->set(static function (Discussion $discussion, ?string $value): void {
                    $cover = $value === null || $value === '' ? null : $value;

                    $discussion->afterSave(static fn (Discussion $saved) => ChangelogEntry::write($saved, [
                        'cover' => $cover,
                    ]));
                }),
        ];
    }

    private static function entry(Discussion $discussion): ?ChangelogEntry
    {
        if (! $discussion->relationLoaded('avocadoChangelog')) {
            return null;
        }

        $entry = $discussion->getRelation('avocadoChangelog');

        return $entry instanceof ChangelogEntry ? $entry : null;
    }
}
