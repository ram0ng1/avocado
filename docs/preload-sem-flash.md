# Eliminando o "flash de dados" em temas Flarum (guia reutilizável)

> Como resolvemos, no tema **DFS**, o problema de os dados da home aparecerem
> **depois** que a página carrega (layout achatado → estruturado, contadores que
> "piscam", cards que trocam). Este guia é genérico — dá para aplicar no
> **avocado** ou em qualquer tema Flarum 2.

## O sintoma

A página pinta primeiro **sem os dados** (ou com um layout provisório/errado) e,
frações de segundo depois, os dados chegam via `fetch`/`app.store.find` e o
componente **re-renderiza**, causando um "salto" visível. Exemplos que tivemos:

- **Categorias**: as tags-pai apareciam como linhas clicáveis e só depois viravam
  seções (fórum → sub-fóruns), porque os **filhos** carregavam via API async.
- **Community strip** (contadores): vinha de `GET /api/dfs/stats` → aparecia depois.
- **Reviews (slider)**: o conjunto de discussões mudava quando o feed async
  terminava de carregar.

## A causa raiz

O Flarum só embute no **boot da página** um subconjunto de dados (o "apiDocument"
principal da rota + o que vem embutido nele). Tudo que o componente busca **depois**
(`app.store.find`, `app.tagList.load`, `app.request`) chega **assíncrono** → 1º
paint sem esse dado → re-render → flash.

> Regra de ouro: **se um dado é necessário no primeiro paint, ele tem que estar no
> payload do boot** (renderizado pelo servidor), não buscado depois.

---

## A solução (3 técnicas)

### 1) Preload server-side no boot (o núcleo da solução)

Injete o dado no documento do boot com um **Content extender**, exatamente como o
core faz com a lista de discussões da index (`Flarum\Forum\Content\Index` usando
`Flarum\Api\Client`). O dado vira `app.data.<chave>` no front.

**Backend** — um Content por dado. Ex.: pré-carregar a árvore COMPLETA de tags:

```php
// src/Content/PreloadTags.php
namespace Ramon\Dfs\Content;

use Flarum\Api\Client;
use Flarum\Frontend\Document;
use Psr\Http\Message\ServerRequestInterface as Request;

class PreloadTags
{
    public function __construct(protected Client $api) {}

    public function __invoke(Document $document, Request $request): void
    {
        try {
            $body = (string) $this->api
                ->withoutErrorHandling()
                ->withParentRequest($request)          // respeita visibilidade do ator
                ->withQueryParams([
                    'include' => 'parent,children,children.lastPostedDiscussion,children.lastPostedDiscussion.user',
                    'page' => ['limit' => 200],
                ])
                ->get('/tags')                          // = /api/tags
                ->getBody();

            $document->payload['dfsTags'] = json_decode($body, false); // vira app.data.dfsTags
        } catch (\Throwable $e) {
            // preload é otimização: se falhar, o front cai no load async (fallback)
        }
    }
}
```

Para um endpoint **customizado** (não-recurso), reuse o próprio controller e
**cacheie** se for caro (counts, etc.):

```php
// src/Content/PreloadStats.php  (resumo)
public function __construct(
    protected \Ramon\Dfs\Api\Controller\StatsController $controller,
    protected \Illuminate\Contracts\Cache\Repository $cache,
) {}

public function __invoke(Document $document, Request $request): void
{
    $stats = $this->cache->remember('dfs.stats.preload', 60, function () use ($request) {
        return json_decode((string) $this->controller->handle($request)->getBody(), true);
    });
    if (is_array($stats)) $document->payload['dfsStats'] = $stats;
}
```

**Registro** (`extend.php`) — em `Extend\Frontend('forum')` (roda em toda página
do fórum):

```php
(new Extend\Frontend('forum'))
    ->js(__DIR__.'/js/dist/forum.js')
    ->css(__DIR__.'/less/forum.less')
    ->content(\Ramon\Dfs\Content\PreloadTags::class)
    ->content(\Ramon\Dfs\Content\PreloadStats::class),
```

**Frontend** — empurre para o store / leia **antes do 1º render** (no `oninit`,
que roda antes do `view()`):

```ts
oninit(vnode) {
  super.oninit(vnode);

  // Árvore de tags → store, ANTES do 1º render (sem flash achatado→seções):
  try {
    const preloaded = (app as any).data?.dfsTags;
    if (preloaded) app.store.pushPayload(preloaded); // {data, included} → models no store
  } catch {}

  this.state = new HomeState();
  // ...
}
```

```ts
// state.loadStats(): leia o preload SÍNCRONO primeiro, depois refresque async
loadStats(): void {
  try {
    const pre = (app as any).data?.dfsStats;
    if (pre && typeof pre === 'object') this.stats = pre; // 1º paint já tem os números
  } catch {}
  app.request({ method: 'GET', url: `${app.forum.attribute('apiUrl')}/dfs/stats` })
    .then((res) => { if (res && typeof res === 'object') { this.stats = res; m.redraw(); } })
    .catch(() => {}); // refresh silencioso ≠ flash (só atualiza números)
}
```

Pontos-chave:
- `$document->payload['x']` no PHP ⇒ `app.data.x` no JS.
- `app.store.pushPayload({data, included})` insere os models **sincronamente**.
- `withParentRequest($request)` faz o preload **respeitar permissões** do visitante
  (ex.: guest vê menos tags). Nunca exponha dado privado no boot.
- Cacheie preloads caros (o Content roda em **toda** página do fórum).

### 2) Derivar do store, não da relação que carrega depois

No 1º paint, uma relação pode não estar "materializada" ainda. Prefira derivar do
**store achatado** por uma relação que JÁ vem no boot. Ex.: agrupar filhos por
`parent()` (o índice de tags do core inclui `parent` por padrão) em vez de
`parent.children()`:

```ts
private childrenOf(parent) {
  const pid = String(parent.id());
  return app.store.all('tags')
    .filter((t) => String(t.parent?.()?.id?.() ?? '') === pid)
    .sort((a, b) => (a.position?.() ?? 9999) - (b.position?.() ?? 9999));
}
```

### 3) Memoizar (congelar) conjuntos derivados de dados que crescem

Se um widget deriva de uma coleção que **cresce** depois (ex.: `latestDiscussions()`
muda quando o feed async adiciona itens), **congele** o conjunto na 1ª vez que
estiver não-vazio, para não trocar em telas seguintes:

```ts
private reviewCache: any[] | null = null;

private reviewItems() {
  if (this.reviewCache?.length) return this.reviewCache; // congelado → sem flash
  const items = /* computa do store quente */;
  if (items.length) this.reviewCache = items;
  return items;
}
```

> Atenção: o cache do `HomeState.latestDiscussions()` **invalida quando o store
> cresce** (`invalidateIfStoreChanged`) — por isso qualquer widget que dependa dele
> pode "piscar". Memoize no componente o que precisa ser estável no page-view.

---

## Bônus: "título de seção" não deve navegar

Fórum tradicional: a tag-**pai** é um **título de seção** (não um link). Deixe o
header **colapsar** em vez de navegar (remova o `<a href>`, use `role="button"` +
`onclick` que dá toggle). Assim o item primário não vira "linha clicável" no flash
nem depois.

---

## Checklist para replicar (no avocado ou em qualquer tema)

1. Liste os dados que a tela precisa **no 1º paint**.
2. Para cada um que hoje é buscado async → crie um `Content` que injeta em
   `$document->payload[...]` (via `Api\Client` para recursos, ou reusando o
   controller para rotas custom; **cacheie** se caro).
3. Registre em `Extend\Frontend('forum')->content(...)`.
4. No `oninit`, `app.store.pushPayload(app.data.x)` (recursos) ou leia
   `app.data.x` síncrono (dados simples) **antes** de renderizar.
5. Derive do store por relações que vêm no boot; memoize conjuntos que crescem.
6. Verifique: `curl <url> | grep '"suaChave"'` — o dado tem que estar no HTML do
   boot. Se estiver, não há flash.

## Como verificar

```bash
# o dado está no payload do boot?
curl -skL https://SEU-FORUM/ | grep -oE '"dfsTags"|"dfsStats"'
# a árvore veio completa? (ex.: relação children presente)
curl -skL https://SEU-FORUM/ | grep -oE '"children":\{"data":\[' | wc -l
```

Se aparecer no boot, o componente renderiza no 1º paint — **sem flash**.
(Cache do navegador/Cloudflare pode mascarar mudanças: `Ctrl+Shift+R` + purgar
`/assets/forum.{js,css}`.)
