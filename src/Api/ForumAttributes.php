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
 * Atributos do ForumResource. As contagens vão para um cache curto (60s):
 * o ForumResource é serializado em todo boot e as tabelas crescem com o fórum.
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

            // A lista de online fica só no <head> (Content\InjectOnlineUsers); repeti-la
            // aqui consultaria a tabela users duas vezes por página.
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

        // Só inteiros positivos: o bind já impede SQLi, mas um setting editado à mão
        // não pode alargar a contagem.
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

        // DISTINCT: uma discussão em duas tags do showcase é um card só. O cache é
        // compartilhado, então conta o que um visitante vê, sem revelar nada restrito.
        $count = Discussion::whereVisibleTo(new Guest())
            ->whereHas('tags', fn ($q) => $q->whereIn('tags.id', $tagIds))
            ->count();

        return min($count, $limit);
    }

    /**
     * O TagPicker grava um array JSON (`["3","7"]`); valores antigos podem ser um id solto.
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
