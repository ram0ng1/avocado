/**
 * Conserta as chaves do rev-manifest para os chunks lazy ganharem o `?v=`.
 *
 * O core procura a revisão de um chunk pela chave
 * `js/<ext>/forum/components/X.js`, mas num servidor Windows o PHP grava as
 * chaves com `\`: a busca nunca casa e todo chunk lazy sai sem `?v=`. Servido
 * com `Cache-Control: immutable`, um chunk alterado chegaria velho.
 *
 * O manifest só é lido na primeira carga de chunk, depois do boot, então basta
 * normalizar as barras antes disso. Em Linux isto não muda nada.
 */
export default function normalizeRevManifest(): void {
  try {
    const el = document.getElementById('flarum-rev-manifest');
    const text = el?.textContent;

    if (!el || !text || !text.includes('\\\\')) return;

    const parsed = JSON.parse(text) as Record<string, string>;
    const normalized: Record<string, string> = {};

    for (const key of Object.keys(parsed)) normalized[key.replace(/\\/g, '/')] = parsed[key];

    el.textContent = JSON.stringify(normalized);

    // Se algum chunk já tiver sido carregado, o registro guardou o JSON antigo.
    const reg = (flarum as any)?.reg;
    if (reg && reg._revisions) reg._revisions = normalized;
  } catch (e) {
    // Manifest ilegível: o core segue pedindo os chunks sem versão.
  }
}
