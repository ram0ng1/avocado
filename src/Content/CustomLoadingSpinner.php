<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Frontend\Document;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Http\Message\ServerRequestInterface;

class CustomLoadingSpinner
{
    public function __construct(protected SettingsRepositoryInterface $settings) {}

    public function __invoke(Document $document, ServerRequestInterface $request): void
    {
        if (!(bool) $this->settings->get('avocado.custom_loading_spinner', false)) {
            return;
        }

        $style = (string) ($this->settings->get('avocado.loading_spinner_style') ?: 'avocado');

        if ($style === 'css-orbital') {
            $this->injectCssOrbital($document);
            return;
        }

        if ($style === 'custom') {
            $raw = trim((string) ($this->settings->get('avocado.loading_spinner_custom') ?? ''));
            if ($raw === '') return;
            $this->injectSpinner($document, '<div class="AvocadoSpinner">' . $raw . '</div>');
            return;
        }

        $svg = match ($style) {
            'orbital' => $this->buildOrbitalSvg(),
            'ditie'   => $this->buildDitieSvg(),
            'b2'      => $this->buildB2Svg(),
            'flarum'  => $this->buildFlarumSvg(),
            'pl3'     => $this->buildPl3Svg(),
            default   => $this->buildAvocadoSvg(),
        };
        $this->injectSpinner($document, '<div class="AvocadoSpinner">' . $svg . '</div>');
    }

    // ── Shared injection ─────────────────────────────────────────────────────

    private function injectSpinner(Document $document, string $html): void
    {
        $json = json_encode($html, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $document->head[] = <<<HTML
<style>
#flarum-loading[data-av-spinner]{padding:0;height:100vh;display:flex;align-items:center;justify-content:center}
#flarum-loading[data-av-spinner] .AvocadoSpinner{color:var(--primary-color,#5c7cfa)}
html.avq-loading #alerts{display:none!important}
</style>
HTML;
        $document->head[] = $this->buildObserverScript($json);
    }

    private function injectCssOrbital(Document $document): void
    {
        $json = json_encode(
            '<div class="AvocadoSpinner"><div class="LoadingIndicator"><i></i></div></div>',
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        $document->head[] = <<<HTML
<style>
#flarum-loading[data-av-spinner]{padding:0;height:100vh;display:flex;align-items:center;justify-content:center}
#flarum-loading[data-av-spinner] .AvocadoSpinner{color:var(--primary-color,#5c7cfa)}
html.avq-loading #alerts{display:none!important}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator>svg{display:none}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator{display:inline-block;width:40px;height:40px;position:relative}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator::before,
html[data-avocado-spinner="css-orbital"] .LoadingIndicator::after,
html[data-avocado-spinner="css-orbital"] .LoadingIndicator>i::before,
html[data-avocado-spinner="css-orbital"] .LoadingIndicator>i::after{content:'';position:absolute;width:40%;height:40%;border-radius:3px;background:currentColor;animation:avocado-orbit 2s cubic-bezier(0.45,0,0.55,1) infinite}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator::before{top:0;left:0;animation-name:avocado-orbit-tl}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator::after{top:0;right:0;animation-name:avocado-orbit-tr}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator>i::before{bottom:0;left:0;animation-name:avocado-orbit-bl}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator>i::after{bottom:0;right:0;animation-name:avocado-orbit-br}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator>i{position:absolute;inset:0;display:block;font-size:0}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator--large{width:60px;height:60px}
html[data-avocado-spinner="css-orbital"] .LoadingIndicator--small{width:20px;height:20px}
@keyframes avocado-orbit-tl{0%,100%{transform:translate(0,0)}25%{transform:translate(0,60%)}50%{transform:translate(60%,60%)}75%{transform:translate(60%,0)}}
@keyframes avocado-orbit-tr{0%,100%{transform:translate(0,0)}25%{transform:translate(-60%,0)}50%{transform:translate(-60%,60%)}75%{transform:translate(0,60%)}}
@keyframes avocado-orbit-br{0%,100%{transform:translate(0,0)}25%{transform:translate(0,-60%)}50%{transform:translate(-60%,-60%)}75%{transform:translate(-60%,0)}}
@keyframes avocado-orbit-bl{0%,100%{transform:translate(0,0)}25%{transform:translate(60%,0)}50%{transform:translate(60%,-60%)}75%{transform:translate(0,-60%)}}
</style>
HTML;
        $document->head[] = $this->buildObserverScript($json, 'css-orbital');
    }

    private function buildObserverScript(string $json, string $spinnerAttr = ''): string
    {
        $setAttr = $spinnerAttr
            ? "document.documentElement.setAttribute('data-avocado-spinner','{$spinnerAttr}');"
            : '';
        return <<<HTML
<script>(function(){
  var h={$json};
  {$setAttr}
  document.documentElement.classList.add('avq-loading');
  function onFound(el){
    el.setAttribute('data-av-spinner','1');
    el.innerHTML=h;
    obs.disconnect();
    var ho=new MutationObserver(function(){
      if(el.style.display==='none'){document.documentElement.classList.remove('avq-loading');ho.disconnect();}
    });
    ho.observe(el,{attributes:true,attributeFilter:['style']});
  }
  function r(){var e=document.getElementById('flarum-loading');if(e&&!e.hasAttribute('data-av-spinner'))onFound(e);}
  var obs=new MutationObserver(r);
  obs.observe(document.documentElement,{childList:true,subtree:true});
  r();
})();</script>
HTML;
    }

    // ── Avocado (default) ────────────────────────────────────────────────────
    private function buildAvocadoSvg(): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="64" height="64" shape-rendering="geometricPrecision">'
            . '<style>.avl-group{transform-origin:100px 100px;animation:avl-rotate 6s linear infinite forwards}.avl-scale{transform-origin:100px 100px;animation:avl-scale 6s linear infinite forwards}.avl-tl{transform-origin:50px 50px;animation:avl-down 6s linear infinite forwards}.avl-tr{transform-origin:150px 50px;animation:avl-up 6s linear infinite forwards}.avl-bl{transform-origin:50px 150px;animation:avl-down 6s linear infinite forwards}.avl-br{transform-origin:150px 150px;animation:avl-up 6s linear infinite forwards}@keyframes avl-rotate{0%,8.33%{transform:rotate(0deg);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}23.33%,31.66%{transform:rotate(90deg);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}36.66%,45%{transform:rotate(180deg);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}50%,58.33%{transform:rotate(270deg);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}63.33%,100%{transform:rotate(360deg)}}@keyframes avl-scale{0%,8.33%{transform:scale(1);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}11.66%,73.33%{transform:scale(0.74);animation-timing-function:cubic-bezier(0.68,-0.55,0.265,1.55)}76.66%,100%{transform:scale(1)}}@keyframes avl-down{0%,3.33%{transform:translateY(0)}6.66%,78.33%{transform:translateY(52px)}81.66%,100%{transform:translateY(0)}}@keyframes avl-up{0%,3.33%{transform:translateY(0)}6.66%,78.33%{transform:translateY(-52px)}81.66%,100%{transform:translateY(0)}}</style>'
            . '<g class="avl-group"><g class="avl-scale">'
            . '<rect class="avl-tl" x="5" y="5" width="90" height="90" rx="6" fill="currentColor"/>'
            . '<rect class="avl-tr" x="105" y="5" width="90" height="90" rx="6" fill="currentColor" opacity="0.75"/>'
            . '<rect class="avl-bl" x="5" y="105" width="90" height="90" rx="6" fill="currentColor" opacity="0.5"/>'
            . '<rect class="avl-br" x="105" y="105" width="90" height="90" rx="6" fill="currentColor" opacity="0.9"/>'
            . '</g></g></svg>';
    }

    // ── Orbital SVG ──────────────────────────────────────────────────────────
    private function buildOrbitalSvg(): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="64" height="64" shape-rendering="geometricPrecision">'
            . '<style>.avq{animation:2s cubic-bezier(0.45,0,0.55,1) infinite}.avq1{animation-name:avq-tl}.avq2{animation-name:avq-tr}.avq3{animation-name:avq-br}.avq4{animation-name:avq-bl}@keyframes avq-tl{0%,100%{transform:translate(0,0)}25%{transform:translate(0,50px)}50%{transform:translate(50px,50px)}75%{transform:translate(50px,0)}}@keyframes avq-tr{0%,100%{transform:translate(0,0)}25%{transform:translate(-50px,0)}50%{transform:translate(-50px,50px)}75%{transform:translate(0,50px)}}@keyframes avq-br{0%,100%{transform:translate(0,0)}25%{transform:translate(0,-50px)}50%{transform:translate(-50px,-50px)}75%{transform:translate(-50px,0)}}@keyframes avq-bl{0%,100%{transform:translate(0,0)}25%{transform:translate(50px,0)}50%{transform:translate(50px,-50px)}75%{transform:translate(0,-50px)}}</style>'
            . '<rect class="avq avq1" x="0" y="0" width="40" height="40" rx="4" fill="currentColor"/>'
            . '<rect class="avq avq2" x="50" y="0" width="40" height="40" rx="4" fill="currentColor"/>'
            . '<rect class="avq avq3" x="50" y="50" width="40" height="40" rx="4" fill="currentColor"/>'
            . '<rect class="avq avq4" x="0" y="50" width="40" height="40" rx="4" fill="currentColor"/>'
            . '</svg>';
    }

    // ── Ditie ────────────────────────────────────────────────────────────────
    private function buildDitieSvg(): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" fill="#4d22b3" viewBox="3.52 1.52 16.96 20.97" width="64" height="64" role="img" aria-label="Carregando">'
            . '<style>.sw-body{animation:sw-rock 1s ease-in-out infinite;transform-origin:12px 12px}@keyframes sw-rock{0%,100%{transform:translateY(0)}50%{transform:translateY(-0.6px)}}.sw-leg1{animation:sw-leg1 1s ease-in-out infinite;transform-origin:6.5px 18.5px}.sw-leg2{animation:sw-leg2 1s ease-in-out infinite;transform-origin:17.5px 18.5px}@keyframes sw-leg1{0%,100%{transform:rotate(0)}50%{transform:rotate(-8deg)}}@keyframes sw-leg2{0%,100%{transform:rotate(0)}50%{transform:rotate(8deg)}}.sw-hl{animation:sw-hl 1.4s ease-in-out infinite}@keyframes sw-hl{0%,100%{opacity:1}50%{opacity:.4}}</style>'
            . '<g class="sw-body">'
            . '<path d="M15,2H9A5,5,0,0,0,4,7v9a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V7A5,5,0,0,0,15,2Z" fill="#4d22b3"/>'
            . '<path d="M20,7H4A5,5,0,0,1,9,2h6A5,5,0,0,1,20,7Z" fill="#ff9300"/>'
            . '<circle class="sw-hl" cx="9" cy="12.5" r="1.5" fill="#ff9300"/>'
            . '<circle class="sw-hl" cx="15" cy="12.5" r="1.5" fill="#ff9300"/>'
            . '</g>'
            . '<path class="sw-leg1" d="M6,22A1.25,1.25,0,0,1,5.68,22a1,1,0,0,1-.63-1.27l1.33-4a1,1,0,1,1,1.9.64L7,21.32A1,1,0,0,1,6,22Z" fill="#ff9300"/>'
            . '<path class="sw-leg2" d="M18.32,22A1,1,0,0,0,19,20.68l-1.33-4a1,1,0,0,0-1.9.64l1.33,4A1,1,0,0,0,18,22,1.25,1.25,0,0,0,18.32,22Z" fill="#ff9300"/>'
            . '</svg>';
    }

    // ── B2 (rotating gradient) ───────────────────────────────────────────────
    private function buildB2Svg(): string
    {
        return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="72" height="72" style="animation:b2-tl 2.4s cubic-bezier(.45,0,.55,1) infinite;transform-origin:center"><style>@keyframes b2-tl{0%{transform:rotate(-30deg)}50%{transform:rotate(150deg)}100%{transform:rotate(330deg)}}</style><defs><linearGradient id="b2c" x1="509.97" x2="509.9" y1="544.75" y2="278.81" gradientTransform="matrix(.93679 -.85929 .85927 .93681 -400.21 462.79)" gradientUnits="userSpaceOnUse"><stop stop-color="#3c1a0f" offset="0"/><stop stop-color="#d7bbb3" offset="1"/></linearGradient><linearGradient id="b2d" x1="498.75" x2="498.75" y1="750.29" y2="353.8" gradientTransform="matrix(.93679 -.85929 .85927 .93681 -400.21 462.79)" gradientUnits="userSpaceOnUse"><stop stop-color="#391b0f" offset="0"/><stop stop-color="#5b2318" offset=".10989"/><stop stop-color="#5b2318" offset=".27473"/><stop stop-color="#905036" offset="1"/></linearGradient></defs><path d="M260.23 242.48C470.17 49.91 703.98 47.53 770.09 50.38c54.62 2.3575 100.81 8.0024 121.59 12.397 34.724 7.3432 25.195 7.327 46.702 33.008s34.249 26.987 35.022 68.388c.63801 34.21 5.9807 206.33-60.35 357.28-66.33 150.96-113.03 188.58-173.28 243.85-60.25 55.26-197.57 142.87-350.57 174.11-79.27 16.19-298.03 7.65-312.03-10.34-5.637-8.26-14.161-17.48-20.932-22.5-15.188-16.56-25.367-51.22-26.948-79.87s-13.148-189.89 60.548-346.12c73.692-156.24 170.39-238.1 170.39-238.1z" fill="url(#b2d)" stroke="#391b0f" stroke-width="2"/><path d="M81.755 498.52c-17.329 40.267-29.251 80.502-37.386 118.39 4.8183 9.8888 10.692 21.773 12.387 24.377 2.6562 4.0799 9.8658 7.23 9.8658 7.23s-.24233 5.6715 6.7906 13.339c7.0329 7.6676 100.31 117.63 135.92 158.82 35.608 41.19 60.582 66.049 63.828 69.588 1.8593 2.0271 5.4259 4.4291 8.2525 6.1763 15.543-4.2981 40.828-11.574 59.3-18.331 25.786-9.4319 41.733-15.98 51.254-20.168-.92898-3.5265-2.8187-8.4402-6.4702-10.992-6.06-4.24-101.43-104.63-149.43-160.52-48-55.88-118.77-135.42-122.01-138.95-3.246-3.5389-3.423-13.194-3.423-13.194s-2.9747 3.8179-10.5-5.5704c-7.5251-9.3882-13.348-19.236-15.955-24.447-.62991-1.2589-1.4808-3.3519-2.4226-5.756zM552.33 77.767c7.6396 1.441 16.468 3.7036 22.299 7.0918 10.117 5.8786 7.2293 4.2466 15.934 12.553 6.1574 5.8755 3.6488 6.8 1.6445 6.847 3.4263.19543 12.986.99306 15.66 3.9093 3.246 3.5389 82.226 81.738 133.77 134.38 51.541 52.64 131.27 147.86 134.96 154.25 1.9395 3.3594 5.3564 5.8918 8.1919 7.5795 6.3015-11.345 20.928-38.305 29.718-59.927 6.415-15.779 11.614-29.352 15.137-38.682-.26239-4.2533-.85961-8.2834-2.1944-9.7387-3.246-3.5389-55.746-68.375-93.713-107.4-37.99-39.03-101.25-98.675-108.29-106.34-7.0329-7.6676-17.782-8.1621-17.782-8.1621s-.39445-6.5863-4.1954-9.6282c-7.6255-6.1026-16.851-9.38-24.794-11.164-36.085 3.6608-79.184 10.878-126.37 24.433z" fill="#fff"/><path d="M142.45 452.05c-4.6501-5.1162-5.487-8.0928.88539-18.556 6.3723-10.464 14.698-20.834 21.395-27.856 6.6976-7.022 14.232-11.067 18.93-17.206 4.6977-6.1385 11.721-19.997 18.466-27.996 6.7441-7.9986 19.906-17.159 23.069-21.903 3.1629-4.7434 7.0704-14.835 19.396-26.972 12.325-12.137 20.371-16.648 24.464-20.368 4.0929-3.7202 7.3024-9.4403 19.163-22.089 11.86-12.649 19.86-16.183 26.511-22.228 6.6509-6.0453 4.4191-10.557 20.139-22.043s25.626-13.95 31.766-19.53c6.1394-5.5802 11.488-15.114 23.581-22.368 12.092-7.254 21.394-7.2996 29.486-12.787 8.0926-5.4871 13.395-14.044 21.999-19.996 8.6042-5.9521 33.254-19.948 39.579-19.157 6.3248.79124 10.696 1.4893 15.346 6.6055 4.6501 5.1162-4.7909 8.0918-13.349 13.067-8.5576 4.9754-18.232 12.834-22.325 16.554-4.0929 3.7202-16.372 14.881-22.418 18.508-6.0461 3.627-18.557 9.3927-29.114 15.252-10.557 5.8589-15.395 14.927-25.581 23.251-10.186 8.3238-26.138 14.415-30.277 19.112-4.1395 4.6968-16.558 18.787-22.186 23.903-5.6277 5.1152-18.278 13.811-23.394 18.461-5.1161 4.6503-16.651 20.741-22.744 25.344-6.0927 4.6036-16.232 11.951-23.953 19.903-7.7208 7.952-12.186 19.485-20.419 27.902-8.2324 8.417-18.371 15.764-25.116 23.763-6.7442 7.9986-8.0936 15.765-15.908 25.67-7.814 9.9053-15.953 16.369-23.209 24.833-7.2558 8.4636-12.512 16.044-16.279 23.206-3.7677 7.1618-6.3723 10.464-9.1158 6.4171-2.7435-4.0464-8.7886-10.697-8.7886-10.697z" fill="#eee" stroke="#b8b8b8"/></svg>
SVG;
    }

    // ── Flarum logo + chat bubbles ───────────────────────────────────────────
    private function buildFlarumSvg(): string
    {
        return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -40 200 180" width="96" height="90"><defs><linearGradient x1="50%" y1="100%" x2="50%" y2="0%" id="cs-g1"><stop stop-color="#D22929" offset="0%"/><stop stop-color="#B71717" offset="100%"/></linearGradient><linearGradient x1="50%" y1="0%" x2="50%" y2="100%" id="cs-g2"><stop stop-color="#E7762E" offset="0%"/><stop stop-color="#E7562E" offset="100%"/></linearGradient></defs><style>.cs-logo{transform-origin:48px 57px;animation:cs-br 2s ease-in-out infinite}@keyframes cs-br{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.04) rotate(-2deg)}}.cs-bubble{transform-origin:center;transform-box:fill-box;opacity:0}.cs-b1{animation:cs-up1 2.4s ease-out infinite}.cs-b2{animation:cs-up2 2.4s ease-out infinite .4s}.cs-b3{animation:cs-up3 2.4s ease-out infinite .8s}.cs-b4{animation:cs-up4 2.4s ease-out infinite 1.2s}.cs-b5{animation:cs-up5 2.4s ease-out infinite 1.6s}@keyframes cs-up1{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(-55px,-70px) scale(1);opacity:0}}@keyframes cs-up2{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(55px,-65px) scale(1);opacity:0}}@keyframes cs-up3{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(-40px,-80px) scale(.9);opacity:0}}@keyframes cs-up4{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(40px,-85px) scale(.9);opacity:0}}@keyframes cs-up5{0%{transform:translate(0,0) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(0,-90px) scale(1.1);opacity:0}}.cs-d{animation:cs-tp 1s ease-in-out infinite}.cs-d2{animation-delay:.12s}.cs-d3{animation-delay:.24s}@keyframes cs-tp{0%,60%,100%{opacity:.4}30%{opacity:1}}</style><g class="cs-bubble cs-b1" transform="translate(30,20)"><path d="M0,0 Q0,-4 4,-4 L20,-4 Q24,-4 24,0 L24,8 Q24,12 20,12 L8,12 L4,16 L4,12 Q0,12 0,8 Z" fill="url(#cs-g2)"/><circle class="cs-d" cx="6" cy="4" r="1.2" fill="#fff"/><circle class="cs-d cs-d2" cx="12" cy="4" r="1.2" fill="#fff"/><circle class="cs-d cs-d3" cx="18" cy="4" r="1.2" fill="#fff"/></g><g class="cs-bubble cs-b2" transform="translate(55,20)"><path d="M24,0 Q24,-4 20,-4 L4,-4 Q0,-4 0,0 L0,8 Q0,12 4,12 L16,12 L20,16 L20,12 Q24,12 24,8 Z" fill="url(#cs-g1)"/><circle class="cs-d" cx="6" cy="4" r="1.2" fill="#fff"/><circle class="cs-d cs-d2" cx="12" cy="4" r="1.2" fill="#fff"/><circle class="cs-d cs-d3" cx="18" cy="4" r="1.2" fill="#fff"/></g><g class="cs-bubble cs-b3" transform="translate(35,15)"><path d="M0,0 Q0,-4 4,-4 L18,-4 Q22,-4 22,0 L22,7 Q22,11 18,11 L7,11 L3,14 L3,11 Q0,11 0,7 Z" fill="url(#cs-g2)"/><circle class="cs-d" cx="6" cy="3.5" r="1" fill="#fff"/><circle class="cs-d cs-d2" cx="11" cy="3.5" r="1" fill="#fff"/><circle class="cs-d cs-d3" cx="16" cy="3.5" r="1" fill="#fff"/></g><g class="cs-bubble cs-b4" transform="translate(52,15)"><path d="M22,0 Q22,-4 18,-4 L4,-4 Q0,-4 0,0 L0,7 Q0,11 4,11 L15,11 L19,14 L19,11 Q22,11 22,7 Z" fill="url(#cs-g1)"/><circle class="cs-d" cx="6" cy="3.5" r="1" fill="#fff"/><circle class="cs-d cs-d2" cx="11" cy="3.5" r="1" fill="#fff"/><circle class="cs-d cs-d3" cx="16" cy="3.5" r="1" fill="#fff"/></g><g class="cs-bubble cs-b5" transform="translate(40,10)"><path d="M0,0 Q0,-4 4,-4 L22,-4 Q26,-4 26,0 L26,9 Q26,13 22,13 L10,13 L5,17 L5,13 Q0,13 0,9 Z" fill="url(#cs-g2)"/><circle class="cs-d" cx="7" cy="4" r="1.3" fill="#fff"/><circle class="cs-d cs-d2" cx="13" cy="4" r="1.3" fill="#fff"/><circle class="cs-d cs-d3" cx="19" cy="4" r="1.3" fill="#fff"/></g><g class="cs-logo"><path d="M.025,75.93 L.002,5.16 C.001,2.31 1.96,1.23 4.37,2.73 L55.16,34.48 L55.16,113.78 L7.58,84.90 C.99,81.31 .03,79.08 .025,75.93 Z" fill="url(#cs-g1)"/><path d="M5.18,0 C2.32,0 0,2.31 0,5.18 L0,75.85 C.14,78.28 .02,80.81 7.73,84.96 C7.73,84.96 .18,77.62 12.07,77.58 L96.54,77.58 L96.54,0 L5.18,0 Z" fill="url(#cs-g2)"/></g></svg>
SVG;
    }

    // ── Pl3 (pulse gradient) ─────────────────────────────────────────────────
    private function buildPl3Svg(): string
    {
        return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="72" height="72" style="animation:avs-pl3 1.2s ease-in-out infinite"><style>@keyframes avs-pl3{0%,100%{transform:scale(1)}15%{transform:scale(1.12)}30%{transform:scale(.95)}45%{transform:scale(1.06)}60%{transform:scale(1)}}</style><defs><linearGradient id="g3c" x1="509.97" x2="509.9" y1="544.75" y2="278.81" gradientTransform="matrix(.93679 -.85929 .85927 .93681 -400.21 462.79)" gradientUnits="userSpaceOnUse"><stop stop-color="#3c1a0f" offset="0"/><stop stop-color="#d7bbb3" offset="1"/></linearGradient><linearGradient id="g3d" x1="498.75" x2="498.75" y1="750.29" y2="353.8" gradientTransform="matrix(.93679 -.85929 .85927 .93681 -400.21 462.79)" gradientUnits="userSpaceOnUse"><stop stop-color="#391b0f" offset="0"/><stop stop-color="#5b2318" offset=".10989"/><stop stop-color="#5b2318" offset=".27473"/><stop stop-color="#905036" offset="1"/></linearGradient></defs><path d="M260.23 242.48C470.17 49.91 703.98 47.53 770.09 50.38c54.62 2.3575 100.81 8.0024 121.59 12.397 34.724 7.3432 25.195 7.327 46.702 33.008s34.249 26.987 35.022 68.388c.63801 34.21 5.9807 206.33-60.35 357.28-66.33 150.96-113.03 188.58-173.28 243.85-60.25 55.26-197.57 142.87-350.57 174.11-79.27 16.19-298.03 7.65-312.03-10.34-5.637-8.26-14.161-17.48-20.932-22.5-15.188-16.56-25.367-51.22-26.948-79.87s-13.148-189.89 60.548-346.12c73.692-156.24 170.39-238.1 170.39-238.1z" fill="url(#g3d)" stroke="#391b0f" stroke-width="2"/><path d="M81.755 498.52c-17.329 40.267-29.251 80.502-37.386 118.39 4.8183 9.8888 10.692 21.773 12.387 24.377 2.6562 4.0799 9.8658 7.23 9.8658 7.23s-.24233 5.6715 6.7906 13.339c7.0329 7.6676 100.31 117.63 135.92 158.82 35.608 41.19 60.582 66.049 63.828 69.588 1.8593 2.0271 5.4259 4.4291 8.2525 6.1763 15.543-4.2981 40.828-11.574 59.3-18.331 25.786-9.4319 41.733-15.98 51.254-20.168-.92898-3.5265-2.8187-8.4402-6.4702-10.992-6.06-4.24-101.43-104.63-149.43-160.52-48-55.88-118.77-135.42-122.01-138.95-3.246-3.5389-3.423-13.194-3.423-13.194s-2.9747 3.8179-10.5-5.5704c-7.5251-9.3882-13.348-19.236-15.955-24.447-.62991-1.2589-1.4808-3.3519-2.4226-5.756zM552.33 77.767c7.6396 1.441 16.468 3.7036 22.299 7.0918 10.117 5.8786 7.2293 4.2466 15.934 12.553 6.1574 5.8755 3.6488 6.8 1.6445 6.847 3.4263.19543 12.986.99306 15.66 3.9093 3.246 3.5389 82.226 81.738 133.77 134.38 51.541 52.64 131.27 147.86 134.96 154.25 1.9395 3.3594 5.3564 5.8918 8.1919 7.5795 6.3015-11.345 20.928-38.305 29.718-59.927 6.415-15.779 11.614-29.352 15.137-38.682-.26239-4.2533-.85961-8.2834-2.1944-9.7387-3.246-3.5389-55.746-68.375-93.713-107.4-37.99-39.03-101.25-98.675-108.29-106.34-7.0329-7.6676-17.782-8.1621-17.782-8.1621s-.39445-6.5863-4.1954-9.6282c-7.6255-6.1026-16.851-9.38-24.794-11.164-36.085 3.6608-79.184 10.878-126.37 24.433z" fill="#fff"/><path d="M142.45 452.05c-4.6501-5.1162-5.487-8.0928.88539-18.556 6.3723-10.464 14.698-20.834 21.395-27.856 6.6976-7.022 14.232-11.067 18.93-17.206 4.6977-6.1385 11.721-19.997 18.466-27.996 6.7441-7.9986 19.906-17.159 23.069-21.903 3.1629-4.7434 7.0704-14.835 19.396-26.972 12.325-12.137 20.371-16.648 24.464-20.368 4.0929-3.7202 7.3024-9.4403 19.163-22.089 11.86-12.649 19.86-16.183 26.511-22.228 6.6509-6.0453 4.4191-10.557 20.139-22.043s25.626-13.95 31.766-19.53c6.1394-5.5802 11.488-15.114 23.581-22.368 12.092-7.254 21.394-7.2996 29.486-12.787 8.0926-5.4871 13.395-14.044 21.999-19.996 8.6042-5.9521 33.254-19.948 39.579-19.157 6.3248.79124 10.696 1.4893 15.346 6.6055 4.6501 5.1162-4.7909 8.0918-13.349 13.067-8.5576 4.9754-18.232 12.834-22.325 16.554-4.0929 3.7202-16.372 14.881-22.418 18.508-6.0461 3.627-18.557 9.3927-29.114 15.252-10.557 5.8589-15.395 14.927-25.581 23.251-10.186 8.3238-26.138 14.415-30.277 19.112-4.1395 4.6968-16.558 18.787-22.186 23.903-5.6277 5.1152-18.278 13.811-23.394 18.461-5.1161 4.6503-16.651 20.741-22.744 25.344-6.0927 4.6036-16.232 11.951-23.953 19.903-7.7208 7.952-12.186 19.485-20.419 27.902-8.2324 8.417-18.371 15.764-25.116 23.763-6.7442 7.9986-8.0936 15.765-15.908 25.67-7.814 9.9053-15.953 16.369-23.209 24.833-7.2558 8.4636-12.512 16.044-16.279 23.206-3.7677 7.1618-6.3723 10.464-9.1158 6.4171-2.7435-4.0464-8.7886-10.697-8.7886-10.697z" fill="#eee" stroke="#b8b8b8"/></svg>
SVG;
    }
}
