/**
 * O navegador resolve os escapes do CSS (`\75 rl(`, `@\69mport`) antes de
 * reconhecer funções e at-rules; os filtros de CSS perigoso testam a forma
 * decodificada. Mesmo comportamento do Support\CssEscapes do servidor.
 */
export default function decodeCssEscapes(css: string): string {
  return css
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
    })
    .replace(/\\(\r\n|[\s\S])/g, '$1');
}
