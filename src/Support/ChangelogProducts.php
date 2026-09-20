<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Flarum\Http\SlugManager;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\Tags\Tag;

/**
 * Os produtos do changelog: as tags principais que o admin marcou em
 * `avocado.changelog_tags`. Cada discussão numa dessas tags é uma versão; as
 * sub-tags do produto são os tipos da mudança (Adicionado, Corrigido, …) e não
 * precisam de configuração — nome, cor e ícone vêm da própria tag.
 */
class ChangelogProducts
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected SlugManager $slugManager,
    ) {
    }

    public function enabled(): bool
    {
        return filter_var($this->settings->get('avocado.changelog_enabled', false), FILTER_VALIDATE_BOOL)
            && class_exists(Tag::class);
    }

    /**
     * IDs configurados. O TagPicker do admin grava um array JSON (`["3","7"]`).
     *
     * @return list<int>
     */
    public function ids(): array
    {
        $decoded = json_decode(trim((string) $this->settings->get('avocado.changelog_tags', '[]')), true);

        if (! is_array($decoded)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map('intval', $decoded))));
    }

    /**
     * Slugs dos produtos, na ordem em que o admin os cadastrou no fórum.
     *
     * O filtro `tag` da API resolve por slug através do slug driver ativo; gerar
     * o slug pelo SlugManager mantém o Utf8SlugDriver e o id_with_slug corretos
     * sem hardcode de formato.
     *
     * @return list<string>
     */
    public function slugs(): array
    {
        $ids = $this->ids();

        if (! $ids) {
            return [];
        }

        $driver = $this->slugManager->forResource(Tag::class);
        $slugs = [];

        /** @var Tag $tag */
        foreach (Tag::query()->whereIn('id', $ids)->orderBy('position')->get() as $tag) {
            $slug = $driver->toSlug($tag);

            // Vírgula é o separador de OR do filtro; um slug que a contenha
            // quebraria a query em duas — descarta em vez de gerar lixo.
            if ($slug !== '' && ! str_contains($slug, ',')) {
                $slugs[] = $slug;
            }
        }

        return $slugs;
    }
}
