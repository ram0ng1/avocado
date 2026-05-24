<?php

declare(strict_types=1);

namespace Ramon\Avocado\Api;

use Flarum\Api\Schema\Attribute;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

/**
 * Atributos do ForumResource expostos pelo Avocado.
 *
 * As contagens (membros do team page, itens do showcase) consultam tabelas
 * que crescem com o forum e são lidas a cada bootstrap do ForumResource —
 * uma página de admin com 10 abas concorrentes geraria 10 COUNT(*) por
 * tabela por minuto. O cache curto (60s) absorve esse pico mantendo a
 * resposta praticamente em tempo real.
 */
class ForumAttributes
{
    private const CACHE_TTL = 60;

    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected CacheRepository $cache,
    ) {
    }

    public function __invoke(): array
    {
        return [
            Attribute::make('avocadoTeamPageMemberCount')
                ->get(fn () => $this->cache->remember(
                    'avocado.team_page_member_count',
                    self::CACHE_TTL,
                    fn () => $this->computeTeamPageMemberCount(),
                )),

            Attribute::make('avocadoShowcaseItemCount')
                ->get(fn () => $this->cache->remember(
                    'avocado.showcase_item_count',
                    self::CACHE_TTL,
                    fn () => $this->computeShowcaseItemCount(),
                )),

            // NOTA: a lista de online users NÃO é exposta aqui. Ela é
            // injetada server-side no <head> como window.__avocadoOnlineUsers
            // por Content\InjectOnlineUsers (single source of truth — §37 do
            // CLAUDE.md). Duplicar como atributo de API rodava o mesmo scan na
            // tabela users duas vezes em cada page load.
        ];
    }

    private function computeTeamPageMemberCount(): int
    {
        if (! $this->settings->get('avocado.team_page_enabled', false)) {
            return 0;
        }

        $raw = (string) ($this->settings->get('avocado.team_page_groups') ?: '[]');
        $groupIds = json_decode($raw, true);

        if (empty($groupIds) || ! is_array($groupIds)) {
            return 0;
        }

        return User::query()
            ->whereHas('groups', fn ($q) => $q->whereIn('groups.id', $groupIds))
            ->count();
    }

    private function computeShowcaseItemCount(): int
    {
        if (! $this->settings->get('avocado.showcase_enabled', false)) {
            return 0;
        }

        // O showcase depende de flarum/tags. Quando a extensão está ausente
        // a classe não é carregável e qualquer referência fataria no boot
        // — guarde antes de tocar no model.
        if (! class_exists(\Flarum\Tags\Tag::class)) {
            return 0;
        }

        $tagId = (int) $this->settings->get('avocado.showcase_tag');
        if (! $tagId) {
            return 0;
        }

        $limit = (int) ($this->settings->get('avocado.showcase_count') ?: 5);

        $tag = \Flarum\Tags\Tag::query()->find($tagId);
        if (! $tag) {
            return 0;
        }

        return min($tag->discussions()->count(), $limit);
    }
}
