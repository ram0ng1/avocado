/**
 * Conteúdo do rodapé, compartilhado entre o admin (que edita) e o fórum (que
 * desenha).
 *
 * Uma opção nunca gravada vale o padrão daqui; gravada vazia, some do rodapé.
 * Por isso estas chaves não têm `->default()` no extend.php: com ele as duas
 * situações chegariam iguais, como string vazia.
 */

export interface FooterLinkItem {
  label: string;
  url: string;
}

export interface FooterSocialItem {
  /** Chave de SOCIAL_NETWORKS, ou OTHER_NETWORK. */
  network: string;
  url: string;
}

export interface SocialNetwork {
  key: string;
  name: string;
  icon: string;
  /** Domínios da rede, para reconhecê-la por um link colado. */
  hosts: RegExp | null;
}

export const SOCIAL_NETWORKS: SocialNetwork[] = [
  { key: 'instagram', name: 'Instagram', icon: 'fab fa-instagram', hosts: /(^|\.)instagram\.com$/ },
  { key: 'x', name: 'X', icon: 'fab fa-x-twitter', hosts: /(^|\.)(x|twitter)\.com$/ },
  { key: 'facebook', name: 'Facebook', icon: 'fab fa-facebook-f', hosts: /(^|\.)(facebook|fb)\.com$/ },
  { key: 'youtube', name: 'YouTube', icon: 'fab fa-youtube', hosts: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { key: 'tiktok', name: 'TikTok', icon: 'fab fa-tiktok', hosts: /(^|\.)tiktok\.com$/ },
  { key: 'whatsapp', name: 'WhatsApp', icon: 'fab fa-whatsapp', hosts: /(^|\.)(wa\.me|whatsapp\.com)$/ },
  { key: 'telegram', name: 'Telegram', icon: 'fab fa-telegram', hosts: /(^|\.)(t\.me|telegram\.me|telegram\.org)$/ },
  { key: 'discord', name: 'Discord', icon: 'fab fa-discord', hosts: /(^|\.)(discord\.gg|discord\.com)$/ },
  { key: 'linkedin', name: 'LinkedIn', icon: 'fab fa-linkedin-in', hosts: /(^|\.)linkedin\.com$/ },
  { key: 'github', name: 'GitHub', icon: 'fab fa-github', hosts: /(^|\.)github\.com$/ },
  { key: 'twitch', name: 'Twitch', icon: 'fab fa-twitch', hosts: /(^|\.)twitch\.tv$/ },
  { key: 'threads', name: 'Threads', icon: 'fab fa-threads', hosts: /(^|\.)threads\.(net|com)$/ },
  { key: 'reddit', name: 'Reddit', icon: 'fab fa-reddit-alien', hosts: /(^|\.)reddit\.com$/ },
  { key: 'pinterest', name: 'Pinterest', icon: 'fab fa-pinterest-p', hosts: /(^|\.)pinterest\.com$/ },
  { key: 'mastodon', name: 'Mastodon', icon: 'fab fa-mastodon', hosts: null },
];

/** Qualquer outro site: ícone de globo, e o nome é o domínio do link. */
export const OTHER_NETWORK = 'other';
export const OTHER_NETWORK_ICON = 'fas fa-globe';

export const networkOf = (key: string): SocialNetwork | null => SOCIAL_NETWORKS.find((network) => network.key === key) ?? null;

export const hostOf = (url: string): string => {
  try {
    return new URL(url, window.location.href).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** A rede de um link, pelo domínio; OTHER_NETWORK quando não é nenhuma das conhecidas. */
export const detectNetwork = (url: string): string => {
  const host = hostOf(url);
  if (!host) return OTHER_NETWORK;
  return SOCIAL_NETWORKS.find((network) => network.hosts?.test(host))?.key ?? OTHER_NETWORK;
};

const MAX_LIST_BYTES = 8192;
const MAX_LIST_ITEMS = 24;

/**
 * Uma lista gravada (JSON) como objetos só com os campos pedidos, todos string.
 * `null` = a opção nunca foi gravada (vale o padrão); `[]` = gravada vazia, ou
 * ilegível — conteúdo estranho não vira padrão de volta.
 */
export function parseFooterList<T>(raw: unknown, fields: (keyof T & string)[]): T[] | null {
  if (raw === null || raw === undefined) return null;

  const text = String(raw).trim();
  if (!text || text.length > MAX_LIST_BYTES) return [];

  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];

    return data
      .filter((entry) => entry && typeof entry === 'object')
      .slice(0, MAX_LIST_ITEMS)
      .map((entry) => Object.fromEntries(fields.map((field) => [field, typeof entry[field] === 'string' ? entry[field] : ''])) as unknown as T);
  } catch {
    return [];
  }
}

// ── Padrões ───────────────────────────────────────────────────────────────────
// Os textos vêm de `ramon-avocado.lib.*`: o Flarum entrega as chaves `lib` aos
// dois frontends, então admin e fórum mostram o mesmo padrão.

type Translate = (key: string, fallback: string) => string;

export const defaultFooterText = (t: Translate): string => t('ramon-avocado.lib.footer.default_text', 'Powered by [Flarum](https://flarum.org).');

/** `{year}` vira o ano atual e `{title}` o título do fórum. */
export const DEFAULT_FOOTER_COPYRIGHT = '© {year} {title}';

export const defaultFooterLinks = (t: Translate): FooterLinkItem[] => {
  const links: FooterLinkItem[] = [
    { label: t('ramon-avocado.lib.footer.nav_home', 'Home'), url: '/' },
    { label: t('ramon-avocado.lib.footer.nav_discussions', 'All discussions'), url: '/discussions' },
  ];

  if ('flarum-tags' in ((globalThis as any).flarum?.extensions ?? {})) {
    links.push({ label: t('ramon-avocado.lib.footer.nav_tags', 'Tags'), url: '/tags' });
  }

  return links;
};
