import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import { trans } from '../utils';
import {
  DEFAULT_FOOTER_COPYRIGHT,
  OTHER_NETWORK_ICON,
  defaultFooterLinks,
  defaultFooterText,
  detectNetwork,
  hostOf,
  networkOf,
  parseFooterList,
} from '../../common/footerContent';
import type { FooterLinkItem, FooterSocialItem } from '../../common/footerContent';

/**
 * Rodapé do tema (admin › Rodapé).
 *
 * Simples de propósito: um bloco estreito e centralizado no fim da página, com
 * uma linha fina em cima e texto discreto — o texto livre, a navegação, os
 * contatos, as redes e o copyright, cada um na sua linha. Sem painel, sem
 * efeito, sem estado: é tudo `view`.
 *
 * Tudo o que aparece é o que está nos campos do admin. Um campo nunca gravado
 * vale o padrão (common/footerContent) — o mesmo que o admin mostra preenchido
 * — e um campo esvaziado é uma linha que não existe.
 */

interface FooterLink {
  /** O rótulo digitado; vazio quando só há o destino. */
  label: string;
  href: string;
  /** Caminho dentro do fórum, para navegar sem recarregar; null = link externo. */
  route: string | null;
}

interface SocialLink extends FooterLink {
  icon: string;
}

/** O valor cru da opção: null quando ela nunca foi gravada. */
const stored = (key: string): unknown => app.forum.attribute(key);

const text = (key: string): string => String(stored(key) ?? '').trim();

/** O texto gravado, ou o padrão quando a opção nunca foi gravada. */
const textOr = (key: string, fallback: string): string => {
  const value = stored(key);
  return (value === null || value === undefined ? fallback : String(value)).trim();
};

/**
 * Um destino digitado no admin vira link só se for um caminho do fórum
 * (`/tags`), http(s), e-mail ou telefone — o resto (`javascript:`, `data:`…) é
 * descartado. Endereços do próprio fórum viram navegação interna.
 */
const toLink = (label: string, rawUrl: string): FooterLink | null => {
  const url = rawUrl.trim();
  const title = label.trim();
  if (!url) return null;

  const basePath = String(app.forum.attribute('basePath') || '');
  const baseUrl = String(app.forum.attribute('baseUrl') || '').replace(/\/+$/, '');

  if (/^\/(?!\/)/.test(url)) return { label: title, href: basePath + url, route: url };

  if (/^https?:\/\//i.test(url)) {
    const internal = baseUrl && (url === baseUrl || url.startsWith(baseUrl + '/'));
    return { label: title, href: url, route: internal ? url.slice(baseUrl.length) || '/' : null };
  }

  if (/^(mailto|tel):/i.test(url)) return { label: title, href: url, route: null };

  return null;
};

/** O texto do link: o rótulo digitado ou, sem ele, o destino sem o protocolo. */
const labelOf = (link: FooterLink): string =>
  link.label ||
  link.route ||
  link.href
    .replace(/^(mailto|tel):/i, '')
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/\/$/, '');

const toLinks = (items: FooterLinkItem[]): FooterLink[] =>
  items.map((item) => toLink(item.label, item.url)).filter((link): link is FooterLink => !!link);

/** A rede escolhida no admin dá o ícone e o nome; "outro site" usa o globo e o domínio. */
const toSocial = (item: FooterSocialItem): SocialLink | null => {
  const link = toLink('', item.url);
  if (!link) return null;

  const network = networkOf(item.network) ?? networkOf(detectNetwork(link.href));
  return { ...link, icon: network?.icon ?? OTHER_NETWORK_ICON, label: network?.name ?? hostOf(link.href) };
};

const follow = (e: MouseEvent, link: FooterLink): void => {
  if (!link.route || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  m.route.set(link.route);
};

const anchor = (link: FooterLink, children: any = labelOf(link), className?: string) =>
  m(
    'a',
    {
      className,
      href: link.href,
      onclick: (e: MouseEvent) => follow(e, link),
      // Site de fora abre em outra aba; e-mail, telefone e o próprio fórum ficam nesta.
      ...(/^https?:/i.test(link.href) && !link.route ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    },
    children
  );

/** `[rótulo](destino)` dentro do texto livre. */
const INLINE_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/**
 * Uma linha do texto livre, com os links em `[rótulo](destino)` virando links
 * de verdade. Nada aqui é HTML: o texto entra como texto e o destino passa pelo
 * mesmo filtro dos outros links — um destino recusado deixa só o rótulo.
 */
const richLine = (line: string): any[] => {
  const parts: any[] = [];
  let last = 0;

  for (const match of line.matchAll(INLINE_LINK)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(line.slice(last, at));
    const link = toLink(match[1], match[2]);
    parts.push(link ? anchor(link) : match[1]);
    last = at + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));

  return parts;
};

export default class AvocadoFooter extends Component {
  view() {
    const email = text('avocadoFooterEmail');
    const phone = text('avocadoFooterPhone');
    const address = text('avocadoFooterAddress');

    const copyright = textOr('avocadoFooterCopyright', DEFAULT_FOOTER_COPYRIGHT)
      .replace(/\{year\}/g, String(new Date().getFullYear()))
      .replace(/\{title\}/g, text('title'));

    const paragraphs = textOr('avocadoFooterText', defaultFooterText(trans))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);

    const navigation = toLinks(parseFooterList<FooterLinkItem>(stored('avocadoFooterLinks'), ['label', 'url']) ?? defaultFooterLinks(trans));
    const legal = toLinks(parseFooterList<FooterLinkItem>(stored('avocadoFooterLegalLinks'), ['label', 'url']) ?? []);
    const socials = (parseFooterList<FooterSocialItem>(stored('avocadoFooterSocial'), ['network', 'url']) ?? [])
      .map(toSocial)
      .filter((social): social is SocialLink => !!social);

    const mailLink = email ? toLink(email, `mailto:${email}`) : null;
    const phoneLink = phone ? toLink(phone, `tel:${phone.replace(/[^\d+]/g, '')}`) : null;
    const hasContacts = !!(mailLink || phoneLink || address);

    // Tudo esvaziado no admin: nenhum rodapé (o montador vazio some pelo CSS).
    if (!paragraphs.length && !navigation.length && !hasContacts && !socials.length && !copyright && !legal.length) return null;

    return (
      <div className="AvocadoFooter">
        {paragraphs.length > 0 && (
          <div className="AvocadoFooter-text">
            {paragraphs.map((line, i) => (
              <p key={i}>{richLine(line)}</p>
            ))}
          </div>
        )}

        {navigation.length > 0 && (
          <nav aria-label={trans('ramon-avocado.forum.footer.navigation', 'Navigation')}>
            <ul className="AvocadoFooter-row AvocadoFooter-nav">
              {navigation.map((link) => (
                <li key={link.href + link.label}>{anchor(link)}</li>
              ))}
            </ul>
          </nav>
        )}

        {hasContacts && (
          <ul className="AvocadoFooter-row" aria-label={trans('ramon-avocado.forum.footer.contacts', 'Contacts')}>
            {mailLink && <li>{anchor(mailLink)}</li>}
            {phoneLink && <li>{anchor(phoneLink)}</li>}
            {address && <li>{address}</li>}
          </ul>
        )}

        {socials.length > 0 && (
          <ul className="AvocadoFooter-row AvocadoFooter-socials" aria-label={trans('ramon-avocado.forum.footer.socials', 'Socials')}>
            {socials.map((social) => (
              <li key={social.href}>
                {anchor(
                  social,
                  <>
                    <i className={social.icon} aria-hidden="true" />
                    <span className="sr-only">{labelOf(social)}</span>
                  </>,
                  'AvocadoFooter-social'
                )}
              </li>
            ))}
          </ul>
        )}

        {(copyright || legal.length > 0) && (
          <ul className="AvocadoFooter-row AvocadoFooter-fine">
            {copyright && <li>{copyright}</li>}
            {legal.map((link) => (
              <li key={link.href + link.label}>{anchor(link)}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
}
