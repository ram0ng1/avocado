<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Flarum\Settings\SettingsRepositoryInterface;

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
 * qualquer tag com "Unknown column". Cache e memo: ver SchemaInspector.
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

    /** Tamanho do ícone em % do glifo: 100 ocupa o mesmo espaço de um ícone Font Awesome. */
    public const SCALE_MIN = 50;

    public const SCALE_MAX = 250;

    public const SCALE_DEFAULT = 100;

    private const TABLE = 'tags';

    private const COLUMN = 'icon_svg';

    private const SCALE_COLUMN = 'icon_svg_scale';

    /** Chave de cache por coluna (a de `icon_svg` é anterior à do tamanho e mantém o nome). */
    private const CACHE_KEYS = [
        self::COLUMN => 'avocado.tag_icon_svg_column_exists',
        self::SCALE_COLUMN => 'avocado.tag_icon_svg_scale_column_exists',
    ];

    public function __construct(
        private readonly SettingsRepositoryInterface $settings,
        private readonly SchemaInspector $schema,
    ) {
    }

    /** O settings guarda '0'/'1' como string: `(bool) '0'` é true, então todo consumidor coage aqui. */
    public function enabled(): bool
    {
        return $this->enabledFor($this->settings->get(self::SETTING, false));
    }

    /** Mesmo veredito a partir do valor cru do setting, para o `serializeToForum`. */
    public function enabledFor(mixed $rawSetting): bool
    {
        return self::toggledOn($rawSetting) && $this->columnsAvailable();
    }

    public function columnsAvailable(): bool
    {
        return $this->hasColumn(self::COLUMN);
    }

    /**
     * O tamanho do ícone chegou numa migration posterior à do SVG. Na mesma janela
     * entre o `composer update` e o `migrate` o ícone segue funcionando — só o
     * campo do tamanho fica de fora do payload até a coluna nascer.
     */
    public function scaleAvailable(): bool
    {
        return $this->columnsAvailable() && $this->hasColumn(self::SCALE_COLUMN);
    }

    private function hasColumn(string $column): bool
    {
        return $this->schema->hasColumn(self::TABLE, $column, self::CACHE_KEYS[$column]);
    }

    private static function toggledOn(mixed $value): bool
    {
        return $value !== null && (bool) filter_var($value, FILTER_VALIDATE_BOOL);
    }
}
