#!/usr/bin/env node
// Mede e compara o tamanho dos bundles JS da extensão (js/dist/**.js), raw e
// gzip. Espelha o fluxo do compare-lhci.mjs: na PR compara contra a baseline
// do master e gera um markdown com deltas 🟢/🔴. Report-only (não trava o CI).
//
// Uso:
//   node bundle-size.mjs measure <distDir> <outJson>
//   node bundle-size.mjs compare <prJson> <baselineJson>   (> comparison.md)

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const [, , cmd, ...rest] = process.argv;

function walkJs(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkJs(full));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

// ── measure ────────────────────────────────────────────────────────────────
if (cmd === 'measure') {
  const [distDir, outJson] = rest;
  if (!distDir || !outJson) {
    console.error('Uso: bundle-size.mjs measure <distDir> <outJson>');
    process.exit(2);
  }
  const base = distDir.replace(/[\\/]+$/, '');
  const files = {};
  let totalRaw = 0;
  let totalGzip = 0;
  for (const f of walkJs(base).sort()) {
    const buf = readFileSync(f);
    const raw = buf.length;
    const gzip = gzipSync(buf, { level: 9 }).length;
    const rel = f.slice(base.length + 1).replace(/\\/g, '/');
    files[rel] = { raw, gzip };
    totalRaw += raw;
    totalGzip += gzip;
  }
  const data = { files, total: { raw: totalRaw, gzip: totalGzip } };
  writeFileSync(outJson, JSON.stringify(data, null, 2));
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

// ── compare ────────────────────────────────────────────────────────────────
if (cmd === 'compare') {
  const [prPath, basePath] = rest;
  if (!prPath) {
    console.error('Uso: bundle-size.mjs compare <prJson> <baselineJson>');
    process.exit(2);
  }
  const pr = JSON.parse(readFileSync(prPath, 'utf8'));
  const base = basePath && existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : null;

  // 🔴 = cresceu (pior), 🟢 = diminuiu (melhor). null base => sem delta.
  const deltaCell = (prV, baseV) => {
    if (baseV == null) return '—';
    const d = prV - baseV;
    if (d === 0) return '= ';
    const arrow = d < 0 ? '🟢' : '🔴';
    const pct = baseV !== 0 ? ` (${((d / baseV) * 100).toFixed(1)}%)` : '';
    return `${arrow} ${d > 0 ? '+' : '−'}${kb(Math.abs(d))}${pct}`;
  };

  const lines = ['# 📦 Bundle size', ''];

  // Veredito no topo, sobre o gzip total (o que pesa na transferência).
  if (!base) {
    lines.push('> Não há baseline do `master` ainda. Os números abaixo são da PR; a comparação delta começa no próximo merge.', '');
  } else {
    const d = pr.total.gzip - base.total.gzip;
    const pct = base.total.gzip !== 0 ? (d / base.total.gzip) * 100 : 0;
    // "Regressão significativa" = gzip total cresceu > 2% E > 2 KB.
    const significant = d > 2048 && pct > 2;
    if (d <= 0) {
      lines.push(`**✅ Sem regressão de tamanho** — gzip total ${d === 0 ? 'inalterado' : '−' + kb(Math.abs(d)) + ` (${pct.toFixed(1)}%)`}.`, '');
    } else if (significant) {
      lines.push(`**⚠️ Regressão de tamanho** — gzip total **+${kb(d)} (+${pct.toFixed(1)}%)**. Verifique se o aumento é intencional (ex.: dependência nova) ou se cabe code-splitting.`, '');
    } else {
      lines.push(`**🟡 Crescimento pequeno** — gzip total +${kb(d)} (+${pct.toFixed(1)}%), abaixo do limiar de regressão (2% / 2 KB).`, '');
    }
  }

  lines.push('| Arquivo | PR (gzip) | Master (gzip) | Δ gzip | PR (raw) | Δ raw |');
  lines.push('|---|---:|---:|---|---:|---|');

  const keys = [...new Set([...Object.keys(pr.files), ...(base ? Object.keys(base.files) : [])])].sort();
  for (const k of keys) {
    const p = pr.files[k] ?? null;
    const b = base?.files[k] ?? null;
    const prGzip = p ? kb(p.gzip) : '— (removido)';
    const baseGzip = b ? kb(b.gzip) : '— (novo)';
    lines.push(
      `| \`${k}\` | ${prGzip} | ${baseGzip} | ${p && b ? deltaCell(p.gzip, b.gzip) : '—'} | ${p ? kb(p.raw) : '—'} | ${p && b ? deltaCell(p.raw, b.raw) : '—'} |`
    );
  }

  const baseTotalGzip = base ? kb(base.total.gzip) : '—';
  lines.push(
    `| **Total** | **${kb(pr.total.gzip)}** | **${baseTotalGzip}** | ${base ? deltaCell(pr.total.gzip, base.total.gzip) : '—'} | **${kb(pr.total.raw)}** | ${base ? deltaCell(pr.total.raw, base.total.raw) : '—'} |`
  );
  lines.push('');
  lines.push('<sub>gzip nível 9. 🟢 = menor que o master · 🔴 = maior. Report-only — não bloqueia o merge.</sub>');

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

console.error(`Comando desconhecido: ${cmd ?? '(nenhum)'}. Use "measure" ou "compare".`);
process.exit(2);
