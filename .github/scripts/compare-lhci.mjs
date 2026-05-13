#!/usr/bin/env node
// Compara os resultados Lighthouse de uma PR contra o baseline do master
// e gera um markdown com (1) tabela de métricas por URL, (2) recomendações
// acionáveis derivadas das oportunidades do Lighthouse, com dicas
// específicas para Flarum 2 + Avocado quando aplicável.
//
// Uso: node compare-lhci.mjs <prDir> <baselineDir>

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , prDir, baselineDir] = process.argv;
if (!prDir || !baselineDir) {
  console.error('Uso: compare-lhci.mjs <prDir> <baselineDir>');
  process.exit(2);
}

const METRICS = [
  ['performance',              'Performance (score)',  'score'],
  ['first-contentful-paint',   'FCP',                  'ms'],
  ['largest-contentful-paint', 'LCP',                  'ms'],
  ['total-blocking-time',      'TBT',                  'ms'],
  ['cumulative-layout-shift',  'CLS',                  'num'],
  ['speed-index',              'Speed Index',          'ms'],
  ['interactive',              'TTI',                  'ms'],
];

// Auditorias de oportunidade que o script vai inspecionar. Cada uma
// vem de uma família de problema diferente; o emoji aponta a categoria
// e a dica é específica para um tema Flarum 2 + Avocado.
const OPPORTUNITIES = [
  {
    id: 'render-blocking-resources',
    label: 'Recursos bloqueando o render',
    tip: 'Mova CSS não-crítico para `<link rel="preload">` ou injete inline o CSS above-the-fold do `forum.less`. Em Flarum 2, o `forum.css` é servido como bloqueante por padrão — considere `media="print" onload` para folhas não-críticas (ex.: dark theme).',
  },
  {
    id: 'unused-css-rules',
    label: 'CSS não utilizado',
    tip: 'O bundle `forum.css` carrega tudo de `less/forum/**`. Divida por rota (Home/Discussion/Tag) via `Extend\\Frontend->css()` condicional no JS, ou use PurgeCSS no webpack para o build de produção.',
  },
  {
    id: 'unused-javascript',
    label: 'JavaScript não utilizado',
    tip: 'Use `import()` dinâmico para componentes só usados em rotas específicas (TeamPage, AvocadoSearchPage). O webpack faz split automático se você usar `import("./components/TeamPage")` dentro do `routes` ao invés de import estático no topo do `index.tsx`.',
  },
  {
    id: 'modern-image-formats',
    label: 'Formatos de imagem modernos',
    tip: 'Sirva WebP/AVIF nas `assets/` (avatares, ícones do tema). Use `<picture>` com fallback para PNG/JPG. Em Avocado, considere converter `assets/*.png` com `cwebp -q 80`.',
  },
  {
    id: 'uses-optimized-images',
    label: 'Imagens não otimizadas',
    tip: 'Comprima PNGs com `oxipng -o 4` e JPEGs com `mozjpeg -quality 82`. O Flarum não otimiza nada por padrão — é responsabilidade do tema/host.',
  },
  {
    id: 'uses-responsive-images',
    label: 'Imagens não responsivas',
    tip: 'Use `srcset` + `sizes` nas imagens do tema. Componentes Avocado que renderizam `<img>` (ThreadCard, PostCard) podem passar múltiplas resoluções.',
  },
  {
    id: 'legacy-javascript',
    label: 'JavaScript legado',
    tip: 'Atualize o `browserslist` no `package.json` para `["last 2 versions", "not dead", "not ie 11"]`. Babel/webpack vão gerar bundles ES2020+ menores, sem polyfills antigos.',
  },
  {
    id: 'total-byte-weight',
    label: 'Peso total da página',
    tip: 'Audite o `js/dist/forum.js` — se passou de ~250 KB gzipped, há código que não precisa estar no caminho crítico. Mova lógica pesada (ex.: editor de markdown, busca) para chunks lazy-loaded.',
  },
  {
    id: 'dom-size',
    label: 'DOM excessivo',
    tip: 'A IndexPage do Avocado pode renderizar 50+ ThreadCards de uma vez. Implemente virtualização (intersection observer + render só do viewport visível) ou paginação real ao invés de "load more" infinito.',
  },
  {
    id: 'bootup-time',
    label: 'Tempo de execução de JS',
    tip: 'Reduza trabalho no `app.initializers`. Cada `app.routes[]`, `extend()` e `override()` no `index.tsx` roda no boot — adie o que não é necessário antes do primeiro paint (ex.: usar `app.initializers.add(..., -10)` para baixar prioridade).',
  },
  {
    id: 'mainthread-work-breakdown',
    label: 'Trabalho na thread principal',
    tip: 'Script evaluation > 1s indica bundle grande ou execução síncrona pesada. Use `requestIdleCallback` para inicialização não-crítica e `web workers` para parsing/markdown se aplicável.',
  },
  {
    id: 'uses-text-compression',
    label: 'Sem compressão de texto',
    tip: 'Habilite gzip/brotli no servidor (nginx: `gzip on; gzip_types text/css application/javascript;` ou `brotli on; brotli_types ...`). Esse é um setting de host, não da extensão, mas reportar aqui ajuda.',
  },
  {
    id: 'uses-long-cache-ttl',
    label: 'Cache HTTP curto',
    tip: 'Os assets versionados em `/assets/forum-<hash>.js` deveriam ter `Cache-Control: public, max-age=31536000, immutable`. Configure no nginx/apache, não no Flarum.',
  },
  {
    id: 'font-display',
    label: 'Web fonts bloqueando render',
    tip: 'Adicione `font-display: swap` (ou `optional`) em todas as `@font-face` do `less/forum/fonts.less`. Sem isso, o navegador esconde texto até a fonte carregar.',
  },
  {
    id: 'uses-rel-preconnect',
    label: 'Sem preconnect para origens críticas',
    tip: 'Se a extensão carrega assets de CDN externa (fonts.gstatic.com, etc.), adicione `<link rel="preconnect">` no header via `Extend\\Frontend->content()`.',
  },
  {
    id: 'server-response-time',
    label: 'TTFB alto',
    tip: 'Backend lento. Verifique: cache de view (`storage/views`), opcache do PHP (`opcache.enable=1`), e queries no `boot()` da extensão. Habilite `flarum cache:clear` no deploy e perfil com `xhprof` se TTFB > 600 ms.',
  },
  {
    id: 'third-party-summary',
    label: 'Scripts de terceiros pesados',
    tip: 'Defira ou self-host bibliotecas externas. Se Avocado depende de algo via CDN, mova para o bundle webpack.',
  },
];

const OPP_BY_ID = new Map(OPPORTUNITIES.map(o => [o.id, o]));

function loadResults(dir) {
  if (!existsSync(dir)) return null;
  const byUrl = new Map();
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith('.json') && ent.name.includes('lhr-')) {
        let lhr;
        try { lhr = JSON.parse(readFileSync(full, 'utf8')); } catch { continue; }
        const rawUrl = lhr.finalUrl || lhr.requestedUrl;
        if (!rawUrl) continue;
        let pathKey = '/';
        try { pathKey = new URL(rawUrl).pathname || '/'; } catch { pathKey = rawUrl; }
        if (pathKey.length > 1) pathKey = pathKey.replace(/\/$/, '');
        byUrl.set(pathKey, lhr);
      }
    }
  };
  walk(dir);
  return byUrl;
}

const pr = loadResults(prDir);
const base = loadResults(baselineDir);

if (!pr || pr.size === 0) {
  process.stdout.write('# 🔬 Performance benchmark\n\nSem resultados na PR. Verifique o job benchmark.\n');
  process.exit(0);
}

const lines = ['# 🔬 Performance benchmark', ''];
if (!base || base.size === 0) {
  lines.push('> Não há baseline do `master` ainda. Os números abaixo são da PR; a comparação delta começa a partir do próximo merge.');
  lines.push('');
}

function metricValue(lhr, audit, type) {
  if (!lhr) return null;
  if (audit === 'performance') return lhr.categories?.performance?.score ?? null;
  const a = lhr.audits?.[audit];
  if (!a) return null;
  return a.numericValue ?? null;
}

function fmt(v, type) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (type === 'score') return (v * 100).toFixed(0);
  if (type === 'ms')    return Math.round(v) + ' ms';
  if (type === 'num')   return v.toFixed(3);
  return String(v);
}

function delta(prV, baseV, type) {
  if (prV == null || baseV == null) return '';
  const d = prV - baseV;
  if (Math.abs(d) < 1e-9) return ' (=)';
  // Para score, maior é melhor. Para tudo o mais, menor é melhor.
  const better = type === 'score' ? d > 0 : d < 0;
  const arrow = better ? '🟢' : '🔴';
  const pct = baseV !== 0 ? ` (${((d / baseV) * 100).toFixed(1)}%)` : '';
  if (type === 'score') return ` ${arrow} ${(d * 100).toFixed(0)}pp${pct}`;
  if (type === 'ms')    return ` ${arrow} ${d > 0 ? '+' : ''}${Math.round(d)} ms${pct}`;
  if (type === 'num')   return ` ${arrow} ${d > 0 ? '+' : ''}${d.toFixed(3)}${pct}`;
  return '';
}

// Extrai recomendações priorizadas de um LHR. Lighthouse expõe
// audits.opportunity com numericValue em ms (savings de tempo) e
// audits.diagnostic em bytes. Filtramos por economia significativa.
function collectOpportunities(lhr) {
  if (!lhr?.audits) return [];
  const out = [];
  for (const [id, audit] of Object.entries(lhr.audits)) {
    if (!OPP_BY_ID.has(id)) continue;
    const score = audit.score; // null | 0..1
    const fails = score !== null && score !== undefined && score < 0.9;
    // Apenas usa `numericValue` como savings em ms quando o audit é
    // realmente do tipo opportunity (Lighthouse marca via details.type).
    const isOpp = audit.details?.type === 'opportunity';
    const savingsMs    = audit.details?.overallSavingsMs ?? (isOpp ? (audit.numericValue ?? 0) : 0);
    const savingsBytes = audit.details?.overallSavingsBytes ?? 0;
    // Considera relevante se: score baixo OU savings > 100ms OU > 10KB.
    if (!fails && savingsMs < 100 && savingsBytes < 10240) continue;
    out.push({
      id,
      score,
      savingsMs,
      savingsBytes,
      displayValue: audit.displayValue,
      title: audit.title,
    });
  }
  // Ordena: score ruim primeiro, depois maior savings em ms, depois bytes.
  out.sort((a, b) => {
    const scoreA = a.score ?? 1, scoreB = b.score ?? 1;
    return scoreA - scoreB
      || (b.savingsMs - a.savingsMs)
      || (b.savingsBytes - a.savingsBytes);
  });
  return out.slice(0, 6); // top 6 por URL para não inundar o comentário.
}

function fmtSavings(o) {
  const parts = [];
  if (o.savingsMs >= 50)      parts.push(`economia ~${Math.round(o.savingsMs)} ms`);
  if (o.savingsBytes >= 1024) parts.push(`~${Math.round(o.savingsBytes / 1024)} KB`);
  if (parts.length === 0 && o.displayValue) parts.push(o.displayValue);
  if (parts.length === 0 && o.score !== null && o.score !== undefined) {
    parts.push(`score ${(o.score * 100).toFixed(0)}/100`);
  }
  return parts.join(' · ') || '—';
}

// --- tabela de métricas por URL ---
for (const [pathKey, prLhr] of [...pr.entries()].sort()) {
  const baseLhr = base?.get(pathKey) ?? null;
  const heading = pathKey === '/' ? 'Home (`/`)' : '`' + pathKey + '`';
  lines.push(`## ${heading}`);
  lines.push('');
  lines.push('| Métrica | PR | Master (baseline) | Δ |');
  lines.push('|---|---:|---:|---|');
  for (const [audit, label, type] of METRICS) {
    const prV   = metricValue(prLhr,   audit, type);
    const baseV = metricValue(baseLhr, audit, type);
    const fmtType = type === 'score' ? 'score' : type;
    lines.push(`| ${label} | ${fmt(prV, fmtType)} | ${fmt(baseV, fmtType)} | ${delta(prV, baseV, fmtType)} |`);
  }
  lines.push('');

  // --- recomendações específicas desta URL ---
  const ops = collectOpportunities(prLhr);
  if (ops.length > 0) {
    lines.push('### 💡 Recomendações (Lighthouse + dicas Flarum 2 / Avocado)');
    lines.push('');
    for (const o of ops) {
      const meta = OPP_BY_ID.get(o.id);
      const savings = fmtSavings(o);
      lines.push(`- **${meta.label}** — ${savings}`);
      lines.push(`  ${meta.tip}`);
    }
    lines.push('');
  } else {
    lines.push('_Sem oportunidades de alto impacto detectadas nesta página._');
    lines.push('');
  }
}

// --- dicas gerais Flarum 2 / Avocado (sempre, no fim) ---
lines.push('---');
lines.push('### 🥑 Dicas gerais para acelerar o tema (Flarum 2 + Avocado)');
lines.push('');
lines.push('1. **Build de produção minificado** — confirme que `npm run build` rodou com `mode: production` (já é o caso no `js/package.json`). Webpack tree-shakes `import { x } from "flarum/..."` se o consumo for explícito.');
lines.push('2. **Split por rota** — `index.tsx` importa todos os Components no topo. Trocar para `import()` dinâmico nas rotas raramente acessadas (TeamPage, AvocadoSearchPage, TagsPage) reduz o `forum.js` inicial.');
lines.push('3. **Less crítico inline** — Flarum 2 serve `forum.css` bloqueando. Considere extrair o CSS above-the-fold (header + 1ª thread visível) e injetar inline via `Extend\\Frontend->content(InlineCriticalCss::class)`.');
lines.push('4. **Avatares** — sirva via `<img loading="lazy">` em todos os ThreadCards/PostCards que não estiverem no fold inicial.');
lines.push('5. **`<link rel="preconnect">`** — se você usa CDN para fontes ou avatares S3, adicione preconnects no header.');
lines.push('6. **`Extend\\Frontend->js()`** rodam síncronos — todo arquivo `js/dist/forum.js` é parseado no boot. Cada `extend()` no `index.tsx` roda antes da primeira pintura.');
lines.push('7. **opcache + view cache** — no host: `opcache.enable=1`, `opcache.validate_timestamps=0` em produção, e `php flarum cache:clear` no deploy.');
lines.push('8. **HTTP/2 + Brotli no host** — o Flarum gera bundles grandes; sem brotli você paga em transferência.');
lines.push('');
lines.push('<sub>Lighthouse desktop, 1 run por URL. 🟢 = melhorou vs master · 🔴 = regrediu.</sub>');

process.stdout.write(lines.join('\n') + '\n');
