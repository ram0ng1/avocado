#!/usr/bin/env node
// Compara os resultados Lighthouse de uma PR contra o baseline do master.
// Entrada: dois diretórios (cada um contendo arquivos lhr-*.json do lhci).
// Saída : comparison.md (markdown) em stdout via process.stdout.write.
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
  ['performance',                   'Performance (score)',    'score'],
  ['first-contentful-paint',        'FCP',                    'ms'],
  ['largest-contentful-paint',      'LCP',                    'ms'],
  ['total-blocking-time',           'TBT',                    'ms'],
  ['cumulative-layout-shift',       'CLS',                    'num'],
  ['speed-index',                   'Speed Index',            'ms'],
  ['interactive',                   'TTI',                    'ms'],
];

function loadResults(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir, { recursive: true })
    .filter(f => typeof f === 'string' && f.endsWith('.json') && f.includes('lhr-'));
  const byUrl = new Map();
  for (const f of files) {
    const path = join(dir, f);
    let lhr;
    try { lhr = JSON.parse(readFileSync(path, 'utf8')); }
    catch { continue; }
    if (!lhr.finalUrl && !lhr.requestedUrl) continue;
    const url = (lhr.finalUrl || lhr.requestedUrl).replace(/\/$/, '') || '/';
    const path_ = new URL(url).pathname || '/';
    byUrl.set(path_, lhr);
  }
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
  lines.push('> Não há baseline do `master` ainda. Os números abaixo são da PR; serão comparados a partir do próximo merge.');
  lines.push('');
}

function val(lhr, audit, type) {
  if (!lhr) return null;
  if (audit === 'performance') {
    return lhr.categories?.performance?.score ?? null;
  }
  const a = lhr.audits?.[audit];
  if (!a) return null;
  if (type === 'ms')    return a.numericValue;
  if (type === 'num')   return a.numericValue;
  return a.numericValue;
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

for (const [pathKey, prLhr] of [...pr.entries()].sort()) {
  const baseLhr = base?.get(pathKey) ?? null;
  lines.push(`## ${pathKey === '/' ? 'Home (`/`)' : '`' + pathKey + '`'}`);
  lines.push('');
  lines.push('| Métrica | PR | Master (baseline) | Δ |');
  lines.push('|---|---:|---:|---|');
  for (const [audit, label, type] of METRICS) {
    const prV   = val(prLhr,   audit, type);
    const baseV = val(baseLhr, audit, type);
    lines.push(`| ${label} | ${fmt(prV, type === 'score' ? 'score' : type)} | ${fmt(baseV, type === 'score' ? 'score' : type)} | ${delta(prV, baseV, type === 'score' ? 'score' : type)} |`);
  }
  lines.push('');
}

lines.push('<sub>Lighthouse desktop, 1 run por URL. 🟢 = melhorou vs master · 🔴 = regrediu.</sub>');
process.stdout.write(lines.join('\n') + '\n');
