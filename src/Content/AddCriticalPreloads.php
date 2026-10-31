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

namespace Ramon\Avocado\Content;

use Flarum\Foundation\Config;
use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Preload da fonte do tema e preconnect para as origens externas configuradas
 * no admin, sem nenhum domínio fixo no código.
 */
class AddCriticalPreloads
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected Config $config,
        protected ThemeFonts $fonts,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $baseUrl  = rtrim((string) $this->config->url(), '/');
        $ownHost  = parse_url($baseUrl, PHP_URL_HOST);

        // Mesma URL da @font-face do AddCriticalCss (ThemeFonts), senão vira um segundo download.
        $fontUrl = $this->fonts->preloadUrl();

        if ($fontUrl !== null) {
            $document->head[] = sprintf(
                '<link rel="preload" as="font" type="font/woff2" href="%s" crossorigin="anonymous">',
                htmlspecialchars($fontUrl, ENT_QUOTES, 'UTF-8')
            );
        }

        $imageSettings = [
            'avocado.hero_image',
            'avocado.auth_image',
            'avocado.logo_svg',
        ];

        $origins = [];
        foreach ($imageSettings as $key) {
            $value = trim((string) $this->settings->get($key));
            if (!$value) continue;

            if (!preg_match('/^https?:\/\//i', $value)) continue;

            $host = parse_url($value, PHP_URL_HOST);
            if (!$host || $host === $ownHost) continue;

            $scheme = parse_url($value, PHP_URL_SCHEME) ?: 'https';
            $origins[$host] = $scheme . '://' . $host;
        }

        foreach ($origins as $origin) {
            $safe = htmlspecialchars($origin, ENT_QUOTES, 'UTF-8');
            if (empty($safe) || !preg_match('/^https?:\/\//', $safe)) {
                continue;
            }
            // crossorigin é preciso para fontes e inofensivo para imagens.
            $document->head[] = '<link rel="preconnect" href="' . $safe . '" crossorigin>';
            $document->head[] = '<link rel="dns-prefetch" href="' . $safe . '">';
        }
    }
}
