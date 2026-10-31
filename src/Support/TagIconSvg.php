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

namespace Ramon\Avocado\Support;

use Flarum\Settings\SettingsRepositoryInterface;

/**
 * O ícone SVG nas tags está ligado — e há colunas para guardá-lo?
 *
 * Com a extensão avulsa `ramon/tag-icon-svg` ativa, o tema cede e o switch fica
 * inerte. As colunas entram na conta como no BookmarksSchema: antes do `migrate`
 * um PATCH de tag daria "Unknown column".
 *
 * Se o flarum/tags for instalado depois de o tema migrar, as colunas não nascem
 * (o Flarum não reexecuta migrations) e o recurso fica desligado.
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

    /** Chave de cache por coluna; a de `icon_svg` mantém o nome original. */
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
     * O tamanho tem migration própria: sem a coluna, só esse campo fica de fora.
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
