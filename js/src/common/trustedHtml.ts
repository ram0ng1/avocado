import type Mithril from 'mithril';

/**
 * Único m.trust do bundle, para a revisão de segurança ter um só ponto. Só
 * recebe HTML já sanitizado: sanitizeAdminHtml, HTML do s9e vindo do servidor
 * (`bioHtml`, `contentHtml`), sanitizeSvgIcon ou constantes do próprio bundle.
 */
const mithrilTrust = m.trust;

export default function trustedHtml(html: string): Mithril.Children {
  return mithrilTrust(html);
}
