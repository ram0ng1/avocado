<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Ramon\Avocado\Model\ChangelogEntry;
use Ramon\Avocado\Support\ChangelogSchema;

/**
 * Os dois atributos de uma versão do changelog na discussão:
 *
 *  - `changelogVersion` — o número ("v2.4.0", "2.0.0-beta.1"), texto livre curto;
 *  - `changelogCover`   — `color` pede o banner na cor da tag; sem valor a capa
 *    é a imagem do hero da discussão (se houver).
 *
 * Quem grava é quem pode criar a discussão ou renomeá-la — a mesma regra do
 * `title` no core —, e o valor só existe enquanto a tabela do tema existir
 * (ChangelogSchema). A leitura vem da relação `avocadoChangelog`, que o endpoint
 * carrega em lote (extend.php). Sem ela carregada — a discussão vindo como
 * `included` de outro endpoint (`/api/posts`, notificações…) — os campos ficam
 * FORA da resposta em vez de sair nulos: um `null` ali sobrescrevia no store do
 * front o valor bom que o Show/Index tinha acabado de entregar (a capa só
 * aparecia ao recarregar a página), e buscar a linha custaria uma consulta por
 * discussão.
 */
class ChangelogFields
{
    /** Espelha CHANGELOG_VERSION_PATTERN em forum/utils. */
    private const VERSION_PATTERN = '/^[0-9A-Za-z][0-9A-Za-z .+_\-]*$/';

    /** @return list<Schema\Attribute> */
    public function __invoke(): array
    {
        $writable = static fn (Discussion $discussion, Context $context): bool => ChangelogSchema::available()
            && ($context->creating() || $context->getActor()->can('rename', $discussion));

        // O 1º argumento é o model quando há um no contexto (serialização) e o próprio
        // Context quando não há. `write()` deixa a relação posta, então a resposta de
        // um create/patch que mexe nos campos já sai com eles.
        $visible = static fn (mixed $model = null): bool => ChangelogSchema::available()
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
