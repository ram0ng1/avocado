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

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * CSS crítico inline: o forum.css do Flarum 2 carrega de forma assíncrona, então
 * fontes, cabeçalho e logo precisam de regras já no primeiro quadro. Mantenha
 * pequeno; o que pode esperar o forum.css fica nele.
 */
class AddCriticalCss
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected ThemeFonts $fonts,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        // Única declaração das @font-face do tema: mesma URL do preload (ThemeFonts).
        $fontFaces = $this->fonts->fontFaces();
        $fontStack = $this->fonts->stack();

        // ── Tamanho do logo ───────────────────────────────────────────────────
        // Repete as regras do logo sem o seletor de atributo: com o CSS assíncrono
        // o logo apareceria no tamanho natural até o forum.css chegar.
        $logoEnabled = (bool) $this->settings->get('avocado.logo_enabled', false);
        $logoSvg     = trim((string) ($this->settings->get('avocado.logo_svg') ?? ''));
        $hasSvgLogo  = $logoEnabled && $logoSvg !== '';

        if ($hasSvgLogo) {
            // O JS define o tamanho pelo viewBox; os 50px reservam o espaço até lá.
            $logoReservation = 'svg.Header-logo,svg.AvocadoLogoSvg{height:50px;width:auto;max-width:none;max-height:none;display:inline-block;vertical-align:middle;flex-shrink:0;overflow:visible}';
        } elseif ($logoEnabled) {
            $logoReservation = 'img.Header-logo{height:35px;width:auto;max-width:200px;display:inline-block;vertical-align:middle}';
        } else {
            // Sem logo do tema: o mesmo limite do core.
            $logoReservation = '.Header-logo{max-height:30px;display:block}';
        }

        // ── Alinhamento do título (só com logo do tema) ───────────────────────
        // O atributo já existe no primeiro paint (HideLogoFlash), mas a regra do
        // App.less só chega com o CSS assíncrono.
        $logoTitleCss = $logoEnabled
            ? '.App-header .Header-title{display:flex!important;align-items:center!important;padding:5px 0}' .
              '#home-link.Header-logo{display:flex;align-items:center;justify-content:center;min-height:50px}'
            : '';

        // ── Espaço do hero ────────────────────────────────────────────────────
        // Reservado para evitar CLS; o min-height impede um banner baixo demais no celular.
        $hasHero = !empty(trim((string) $this->settings->get('avocado.hero_image')));
        $heroReservation = $hasHero
            ? '.Hero--banner{aspect-ratio:3/1;min-height:280px;contain:layout style}@media(min-width:768px){.Hero--banner{min-height:400px}}'
            : '';

        // ── Showcase no celular ───────────────────────────────────────────────
        // Carrossel horizontal desde o primeiro quadro: sem isto os cards empilham
        // até o CSS chegar (as regras @phone do HomePage.less).
        $showcaseEnabled = (bool) $this->settings->get('avocado.showcase_enabled', false);
        $showcaseCss = $showcaseEnabled
            ? '@media(max-width:767px){' .
                '.AvocadoHome-showcaseGrid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:10px;padding-bottom:6px;scrollbar-width:none}' .
                '.AvocadoHome-showcaseCard{flex:0 0 72vw;max-width:240px;scroll-snap-align:start;height:auto}' .
              '}'
            : '';

        // ── Controles de navegação no celular ─────────────────────────────────
        // Esconde o .AvocadoNav-helper e posiciona os controles do cabeçalho antes do
        // CSS chegar, para não pularem na tela. Breakpoints do core: @phone ≤ 767px.
        $mobileNavCss =
            '.AvocadoNav-helper{height:0;overflow:hidden}' .
            '@media(max-width:767px){' .
                // Mesmas regras de celular do App.less do core.
                '.App-primaryControl,.App-titleControl,.App-backControl{' .
                    'position:absolute!important;top:0!important;margin:0;' .
                    'z-index:1001}' .
                '.App-titleControl{width:200px;left:50%;margin-left:-100px;text-align:center}' .
                '.App-primaryControl{right:0}' .
                '.App-backControl{left:0}' .
            '}';

        // `contain:layout` no `.App-header` só do tablet para cima: no celular o
        // cabeçalho fica dentro do `.App-drawer` e prenderia os dropdowns
        // `position:fixed` (bottom sheets) dentro dele.
        //
        // `.App` usa `min-height:100vh`, nunca `height:100%`: com altura fixa o
        // conteúdo transborda e um rodapé depois do #app fica pintado por baixo dele.
        $css = <<<CSS
        {$fontFaces}
        :root{--avocado-font-sans:{$fontStack}}
        html,body{margin:0;padding:0}
        body{font-family:{$fontStack};overflow-x:hidden}
        *,*::before,*::after{box-sizing:border-box}
        .App{display:flex;flex-direction:column;min-height:100vh}
        .App-content{flex:1 1 auto;min-width:0}
        .App-header{display:flex}@media(min-width:768px){.App-header{height:52px;min-height:52px;contain:layout}}
        {$logoReservation}
        {$logoTitleCss}
        {$mobileNavCss}
        {$heroReservation}
        {$showcaseCss}
        CSS;

        $css = preg_replace('/\s*\n\s*/', '', trim($css));

        $document->head[] = '<style id="avocado-critical">' . $css . '</style>';
    }
}
