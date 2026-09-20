<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\ConnectionInterface;
use Throwable;

/**
 * O ícone SVG nas tags está ligado — e há colunas para guardá-lo?
 *
 * O recurso vem da extensão `ramon/tag-icon-svg`, que o tema absorveu atrás de
 * um switch. Como acontece com o fof/bookmarks, quem cede é o tema: com a
 * extensão avulsa ativa ela continua dona dos campos, do override do `Icon` e do
 * campo no modal de tag (ver extend.php), e o switch do tema fica inerte.
 *
 * As colunas entram na conta pelo mesmo motivo do BookmarksSchema: o pacote é
 * entregue por `composer update` e a migration só corre no `php flarum migrate`
 * seguinte. Nessa janela, aceitar escrita em `icon_svg` derrubaria o PATCH de
 * qualquer tag com "Unknown column".
 *
 * Limite conhecido: a migration só adiciona as colunas quando a tabela `tags` já
 * existe. Se o flarum/tags for instalado DEPOIS de o tema migrar, as colunas não
 * nascem sozinhas (o Flarum não reexecuta uma migration já registrada) e o
 * recurso permanece desligado até o admin criá-las.
 */
final class TagIconSvg
{
    public const SETTING = 'avocado.tag_icon_svg_enabled';

    public const TAGS_EXTENSION_ID = 'flarum-tags';

    public const STANDALONE_EXTENSION_ID = 'ramon-tag-icon-svg';

    private const TABLE = 'tags';

    private const COLUMN = 'icon_svg';

    private const CACHE_KEY = 'avocado.tag_icon_svg_column_exists';

    /** Memo do request; null = ainda não checado. */
    private static ?bool $columnExists = null;

    /** O settings guarda '0'/'1' como string: `(bool) '0'` é true, então todo consumidor coage aqui. */
    public static function enabled(SettingsRepositoryInterface $settings): bool
    {
        return self::toggledOn($settings->get(self::SETTING, false)) && self::columnsAvailable();
    }

    /** Mesmo veredito a partir do valor cru do setting, para o `serializeToForum`. */
    public static function enabledFor(mixed $rawSetting): bool
    {
        return self::toggledOn($rawSetting) && self::columnsAvailable();
    }

    public static function columnsAvailable(): bool
    {
        if (self::$columnExists !== null) {
            return self::$columnExists;
        }

        try {
            $cache = resolve(CacheRepository::class);

            if ($cache->get(self::CACHE_KEY)) {
                return self::$columnExists = true;
            }

            $exists = resolve(ConnectionInterface::class)
                ->getSchemaBuilder()
                ->hasColumn(self::TABLE, self::COLUMN);

            // Só o "existe" é cacheado: coluna criada não some sozinha, e o
            // "não existe" precisa ser reavaliado para o recurso ligar assim que
            // o admin migrar.
            if ($exists) {
                $cache->forever(self::CACHE_KEY, true);
            }

            return self::$columnExists = $exists;
        } catch (Throwable) {
            // Banco fora do ar ou install em andamento: o tema não é o lugar de estourar por isso.
            return self::$columnExists = false;
        }
    }

    /** Ponto de teste — zera o memo do request. */
    public static function forget(): void
    {
        self::$columnExists = null;
    }

    private static function toggledOn(mixed $value): bool
    {
        return $value !== null && (bool) filter_var($value, FILTER_VALIDATE_BOOL);
    }
}
