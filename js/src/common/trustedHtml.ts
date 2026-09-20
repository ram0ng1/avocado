import type Mithril from 'mithril';

/**
 * Ponto único de m.trust do bundle. Só recebe HTML que JÁ passou por
 * sanitização: sanitizeAdminHtml (hero/footer de admin), HTML renderizado e
 * sanitizado no servidor pelo s9e (ex.: `bioHtml` do fof/user-bio, o
 * `contentHtml` de um post no changelog), sanitizeSvgIcon (ícone SVG de tag —
 * espelho do SvgIconSanitizer do servidor), ou constante do próprio bundle
 * (SVGs do SpinnerPicker). Centralizar aqui deixa
 * a auditoria com um único sink para revisar.
 */
const mithrilTrust = m.trust;

export default function trustedHtml(html: string): Mithril.Children {
  return mithrilTrust(html);
}
