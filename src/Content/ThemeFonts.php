<?php

declare(strict_types=1);

namespace Ramon\Avocado\Content;

use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Filesystem\Cloud;
use Illuminate\Contracts\Filesystem\Factory;

/**
 * Fonte única da tipografia do tema: qual família vale (setting
 * `avocado.font_family`), as @font-face dela e a URL do preload.
 *
 * A @font-face (CSS crítico inline) e o `<link rel="preload">` precisam pedir
 * EXATAMENTE a mesma URL — senão o navegador baixa o arquivo duas vezes. Antes
 * havia uma segunda declaração em less/common/fonts.less com caminho relativo à
 * raiz (`/assets/fonts/…`), que divergia da URL absoluta do preload em instalação
 * em subpasta, CDN de assets ou host diferente do configurado. Agora as duas
 * saem daqui, do disco `flarum-assets` — o mesmo que o core usa para as fontes
 * do Font Awesome.
 *
 * O LESS não conhece a escolha: toda regra usa `@font-sans`, que é
 * `var(--avocado-font-sans, …)`, e o valor da variável sai de stack().
 */
final class ThemeFonts
{
    public const NORMAL = 'fonts/dm-sans-variable.woff2';

    public const ITALIC = 'fonts/dm-sans-italic.woff2';

    /** DM Sans embutida — o padrão do tema (só latim). */
    public const DM_SANS = 'dm-sans';

    /** Fonte da interface do sistema: nenhum download, cobre qualquer escrita. */
    public const SYSTEM = 'system';

    /** Inter embutida (latim, latim estendido, vietnamita, cirílico e grego). */
    public const INTER = 'inter';

    /** Família digitada pelo admin (`avocado.font_custom_family`); o arquivo é por conta dele. */
    public const CUSTOM = 'custom';

    private const STACKS = [
        self::DM_SANS => "'DM Sans Variable','DM Sans','Segoe UI',sans-serif",
        self::SYSTEM  => "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue','Noto Sans',Arial,sans-serif",
        self::INTER   => "'Inter Variable',Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    ];

    /**
     * Subconjuntos do Inter (assets/fonts/inter-<nome>-wght-{normal,italic}.woff2,
     * do pacote @fontsource-variable/inter) e o unicode-range de cada um: o
     * navegador só baixa os arquivos cujos caracteres aparecem na página.
     */
    private const INTER_SUBSETS = [
        'cyrillic-ext' => 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
        'cyrillic'     => 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
        'greek-ext'    => 'U+1F00-1FFF',
        'greek'        => 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
        'vietnamese'   => 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
        'latin-ext'    => 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
        'latin'        => 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    ];

    /** Palavras-chave genéricas do CSS: saem sem aspas (entre aspas viram nome de fonte). */
    private const GENERIC_FAMILIES = [
        'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'math', 'emoji', 'fangsong',
        'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    ];

    public function __construct(
        protected Factory $filesystem,
        protected SettingsRepositoryInterface $settings,
    ) {}

    public function url(string $file): string
    {
        // O disco de assets é sempre um Cloud (local ou remoto) — o core também o
        // trata assim (`$assetsDir->url()` nos compiladores de assets).
        /** @var Cloud $disk */
        $disk = $this->filesystem->disk('flarum-assets');

        return $disk->url($file);
    }

    /**
     * A opção em vigor. Um valor desconhecido, ou "custom" sem uma família
     * válida digitada, cai no padrão.
     */
    public function choice(): string
    {
        $choice = (string) $this->settings->get('avocado.font_family', self::DM_SANS);

        if ($choice === self::CUSTOM) {
            return $this->customStack() === null ? self::DM_SANS : self::CUSTOM;
        }

        return isset(self::STACKS[$choice]) ? $choice : self::DM_SANS;
    }

    /** Valor de `font-family` para a opção em vigor — já seguro para ir num <style>. */
    public function stack(): string
    {
        $choice = $this->choice();

        return $choice === self::CUSTOM ? (string) $this->customStack() : self::STACKS[$choice];
    }

    /** As @font-face da opção em vigor; vazio para as que não têm arquivo do tema. */
    public function fontFaces(): string
    {
        return match ($this->choice()) {
            self::DM_SANS => $this->dmSansFaces(),
            self::INTER   => $this->interFaces(),
            default       => '',
        };
    }

    /** Arquivo a pré-carregar (o do texto latino normal), ou null. */
    public function preloadUrl(): ?string
    {
        return match ($this->choice()) {
            self::DM_SANS => $this->url(self::NORMAL),
            self::INTER   => $this->url(self::interFile('latin', 'normal')),
            default       => null,
        };
    }

    /**
     * Normaliza a lista de famílias digitada pelo admin, ou null se não sobrar
     * nada aproveitável.
     *
     * O valor vai para dentro de um <style> inline, então não é repassado como
     * veio: cada família é validada (letras, números, espaço, hífen e
     * sublinhado) e REEMITIDA entre aspas simples — uma aspa sem par engoliria o
     * resto do CSS crítico, que fica todo numa linha só. Palavras-chave
     * genéricas saem sem aspas, e a lista sempre termina num fallback genérico.
     */
    public static function sanitizeFamily(string $value): ?string
    {
        $families = [];
        $hasGeneric = false;

        foreach (explode(',', mb_substr($value, 0, 300)) as $part) {
            $name = trim(trim($part), '\'"');
            $name = trim((string) preg_replace('/\s+/u', ' ', $name));

            if ($name === '' || mb_strlen($name) > 60 || ! preg_match('/^[\p{L}\p{N} _-]+$/u', $name)) {
                continue;
            }

            if (in_array(strtolower($name), self::GENERIC_FAMILIES, true)) {
                $families[] = strtolower($name);
                $hasGeneric = true;
            } else {
                $families[] = "'".$name."'";
            }

            if (count($families) >= 8) {
                break;
            }
        }

        if ($families === []) {
            return null;
        }

        if (! $hasGeneric) {
            $families[] = 'sans-serif';
        }

        return implode(',', $families);
    }

    private function customStack(): ?string
    {
        return self::sanitizeFamily((string) $this->settings->get('avocado.font_custom_family', ''));
    }

    private static function interFile(string $subset, string $style): string
    {
        return 'fonts/inter-'.$subset.'-wght-'.$style.'.woff2';
    }

    /**
     * As mesmas 4 faces de sempre — a itálica do apelido 'DM Sans' vinha só do
     * LESS e mora aqui, para o itálico real valer onde 'DM Sans' vem primeiro.
     */
    private function dmSansFaces(): string
    {
        $css = '';

        foreach (['DM Sans Variable', 'DM Sans'] as $family) {
            foreach (['normal' => self::NORMAL, 'italic' => self::ITALIC] as $style => $file) {
                $css .= $this->face($family, $style, $file);
            }
        }

        return $css;
    }

    private function interFaces(): string
    {
        $css = '';

        foreach (['normal', 'italic'] as $style) {
            foreach (self::INTER_SUBSETS as $subset => $range) {
                $css .= $this->face('Inter Variable', $style, self::interFile($subset, $style), $range);
            }
        }

        return $css;
    }

    private function face(string $family, string $style, string $file, ?string $unicodeRange = null): string
    {
        $url = htmlspecialchars($this->url($file), ENT_QUOTES, 'UTF-8');

        return "@font-face{font-family:'{$family}';font-weight:100 900;font-style:{$style};font-display:swap;"
            ."src:url('{$url}') format('woff2-variations')"
            .($unicodeRange === null ? '' : ';unicode-range:'.$unicodeRange)
            .'}';
    }
}
