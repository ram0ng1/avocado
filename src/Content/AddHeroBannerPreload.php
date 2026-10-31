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

class AddHeroBannerPreload
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected Config $config,
    ) {}

    /**
     * O caminho vem de um setting e vira URL do disco: nada de path traversal.
     */
    private function validateAssetPath(string $path): ?string
    {
        if (preg_match('/(\.\.\/|\.\.\\\\|^\.\.+$)/', $path)) {
            return null;
        }

        $normalized = str_replace('\\', '/', $path);

        $normalized = ltrim($normalized, '/');

        return $normalized;
    }

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        $heroImage = trim((string) $this->settings->get('avocado.hero_image'));

        if (!$heroImage) return;

        $heroUrl = preg_match('/^https?:\/\//', $heroImage)
            ? $heroImage
            : rtrim((string) $this->config->url(), '/') . '/assets/' . $this->validateAssetPath($heroImage);

        if (str_ends_with($heroUrl, '/assets/')) {
            return;
        }

        if (!preg_match('/^(https?:\/\/|\/)/', $heroUrl)) {
            return;
        }

        $escapedUrl = htmlspecialchars($heroUrl, ENT_QUOTES, 'UTF-8');

        if (empty($escapedUrl)) {
            return;
        }

        // imagesizes diz ao navegador o tamanho renderizado esperado, para escolher a fonte certa.
        $document->head[] = '<link rel="preload" as="image" href="' . $escapedUrl . '" fetchpriority="high" imagesizes="100vw">';
    }
}
