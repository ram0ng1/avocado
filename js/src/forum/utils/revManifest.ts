/**
 * Conserta as chaves do rev-manifest para os chunks lazy ganharem o `?v=`.
 *
 * O core monta a URL de um chunk em `ExportRegistry.chunkUrl()` e procura a
 * revisão no `#flarum-rev-manifest` pela chave `js/<ext>/forum/components/X.js`.
 * Num servidor Windows o PHP grava essas chaves com `DIRECTORY_SEPARATOR`
 * (`js\ramon-avocado\forum\components/X.js`), a busca nunca casa e TODO chunk
 * lazy — do core, das extensões e do tema — sai sem `?v=`. Como o arquivo é
 * servido com `Cache-Control: immutable` de um ano (e o Cloudflare guarda), um
 * chunk alterado continuava chegando velho: foi por isso que a página do
 * changelog e a de salvos tinham ido para o bundle principal.
 *
 * O manifest só é lido na primeira carga de chunk (`_revisions ??= …`), depois
 * do boot; então basta normalizar as barras no JSON antes disso. Em Linux as
 * chaves já vêm com `/` e isto não muda nada. O token de revisão dos assets
 * (alerta de "nova versão") vem do payload do servidor, não deste JSON.
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
    // Manifest ilegível: o core segue pedindo os chunks sem versão, como antes.
  }
}
