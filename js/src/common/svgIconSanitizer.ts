/**
 * Espelho, no navegador, de `Support\SvgIconSanitizer` (PHP) — as MESMAS
 * allowlists, mantidas em par. O servidor é quem sanitiza o que vai ao banco;
 * este lado existe porque o markup é embutido como HTML cru (trustedHtml):
 *
 *  - a pré-visualização do modal da tag mostra o ARQUIVO que o admin acabou de
 *    escolher, antes de qualquer ida ao servidor;
 *  - uma linha que não passou pela API (importada da extensão avulsa, escrita
 *    direto no banco) não teria sido sanitizada por ninguém.
 *
 * Só remove: não reescreve ids/classes nem move fill/stroke como o servidor faz
 * (isso é apresentação, não segurança). Devolve null quando não há SVG utilizável.
 */
export const MAX_SVG_BYTES = 102400;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
// No DOM do navegador as declarações `xmlns`/`xmlns:xlink` aparecem como
// atributos neste namespace (no DOM do PHP elas não entram em `attributes`).
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

const ALLOWED_ATTRIBUTE_NS: Array<string | null> = [null, SVG_NS, XLINK_NS, XML_NS, XMLNS_NS];

const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'title',
  'desc',
  'switch',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textPath',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'image',
  'style',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
]);

// "HTML integration points": embutido numa página, o conteúdo deles é lido pelo
// parser de HTML — um <style> ali vira RAWTEXT e `</style><img onerror=…>`
// escaparia. Ficam só com o texto.
const TEXT_ONLY_ELEMENTS = new Set(['title', 'desc']);

const DANGEROUS_CSS = /@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding|url\s*\(\s*["']?\s*[^#"'\s)]/i;
const DANGEROUS_VALUE = /javascript:|data:text\/html|vbscript:/i;
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

const isDangerousCss = (css: string): boolean => css.includes('<') || DANGEROUS_CSS.test(css);

const isSafeHref = (value: string): boolean => value === '' || value.startsWith('#') || SAFE_DATA_IMAGE.test(value);

const isAllowedElement = (element: Element): boolean =>
  (element.namespaceURI === null || element.namespaceURI === SVG_NS) && ALLOWED_ELEMENTS.has(element.localName);

function parse(svg: string): Element | null {
  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  } catch {
    return null;
  }

  // XML malformado não lança: vira um documento com <parsererror>.
  if (!doc.documentElement || doc.getElementsByTagName('parsererror').length > 0) return null;

  return doc.documentElement;
}

function cleanAttributes(element: Element): void {
  // Array.from: removeAttributeNode muda o NamedNodeMap durante a iteração.
  Array.from(element.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase();
    const value = attr.value.trim();

    const remove =
      name.startsWith('on') ||
      !ALLOWED_ATTRIBUTE_NS.includes(attr.namespaceURI) ||
      (attr.localName === 'href' && !isSafeHref(value)) ||
      (name === 'style' && DANGEROUS_CSS.test(value)) ||
      (name !== 'style' && DANGEROUS_VALUE.test(value.replace(/\s+/g, '')));

    if (remove) element.removeAttributeNode(attr);
  });
}

function clean(element: Element): void {
  cleanAttributes(element);

  const textOnly = TEXT_ONLY_ELEMENTS.has(element.localName);

  Array.from(element.childNodes).forEach((child) => {
    if (child.nodeType === Node.COMMENT_NODE || child.nodeType === Node.PROCESSING_INSTRUCTION_NODE || child.nodeType === Node.DOCUMENT_TYPE_NODE) {
      element.removeChild(child);
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const el = child as Element;

    if (textOnly || !isAllowedElement(el) || (el.localName === 'style' && isDangerousCss(el.textContent || ''))) {
      element.removeChild(el);
      return;
    }

    clean(el);
  });
}

export default function sanitizeSvgIcon(input: string | null | undefined): string | null {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return null;

  let svg = (input ?? '')
    .toString()
    .replace(/^\uFEFF/, '')
    .trim();

  if (!svg || svg.length > MAX_SVG_BYTES) return null;

  // Sem prólogo e sem DOCTYPE: nada pode declarar entidades.
  svg = svg.replace(/<\?xml[^>]*\?>/gi, '').replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '');

  if (/<!ENTITY/i.test(svg)) return null;

  svg = svg.trim();

  let root = parse(svg);

  // Trecho colado sem as declarações de namespace é comum: acrescenta e tenta de novo.
  if ((!root || root.namespaceURI === null) && !/<svg[^>]*\sxmlns=/i.test(svg)) {
    root = parse(svg.replace(/<svg\b/i, `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}"`));
  }

  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return null;

  clean(root);

  try {
    return new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }
}
