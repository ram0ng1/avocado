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

use Flarum\Api\Schema\Attribute;
use Flarum\Api\Context;
use Flarum\Discussion\Discussion;
use Flarum\Extension\ExtensionManager;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\Guest;
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
        protected ExtensionManager $extensions,
    ) {
    }

    public function __invoke(): array
    {
        return [
            // Mesma regra do PreloadTeamMembers: quem não pode buscar usuários
            // não vê a lista, e nem quantos são.
            Attribute::make('avocadoTeamPageMemberCount')
                ->get(fn (object $forum, Context $context) => $context->getActor()->cannot('searchUsers') ? 0 : $this->cache->remember(
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
        $decoded = json_decode($raw, true);

        if (! is_array($decoded) || $decoded === []) {
            return 0;
        }

        // Coerce every entry to a positive integer; drop nulls, booleans,
        // strings, and zero/negative values that a hand-edited setting could
        // smuggle into whereIn. Eloquent binds parameters, so this is shape
        // hygiene rather than SQLi defense, but it stops malformed settings
        // from silently widening the count.
        $groupIds = array_values(array_filter(
            array_map('intval', $decoded),
            static fn (int $id): bool => $id > 0,
        ));

        if ($groupIds === []) {
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

        // O showcase depende de flarum/tags. Instalada mas desligada, a classe
        // carrega e a tabela existe, mas a relação e o filtro por tag não.
        if (! $this->extensions->isEnabled('flarum-tags')) {
            return 0;
        }

        $tagIds = $this->showcaseTagIds();
        if (! $tagIds) {
            return 0;
        }

        $limit = (int) ($this->settings->get('avocado.showcase_count') ?: 5);

        // Contagem DISTINCT sobre o conjunto de tags: uma discussão marcada com
        // duas tags do showcase é um card só, não dois.
        // O cache é um só para todos: conta o que um visitante vê, para não
        // revelar discussões ocultas, privadas ou em tags restritas.
        $count = Discussion::whereVisibleTo(new Guest())
            ->whereHas('tags', fn ($q) => $q->whereIn('tags.id', $tagIds))
            ->count();

        return min($count, $limit);
    }

    /**
     * IDs das tags do showcase.
     *
     * O TagPicker do admin grava um array JSON (`["3","7"]`); instalações
     * antigas ainda podem ter um id solto. Um `(int)` direto sobre o JSON dava
     * 0 e zerava a contagem — o skeleton caía no fallback e o valor nunca
     * refletia mais de uma tag.
     *
     * @return int[]
     */
    private function showcaseTagIds(): array
    {
        $raw = trim((string) $this->settings->get('avocado.showcase_tag'));
        if ($raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        $values = is_array($decoded) ? $decoded : [$decoded ?? $raw];

        return array_values(array_unique(array_filter(array_map('intval', $values))));
    }
}
