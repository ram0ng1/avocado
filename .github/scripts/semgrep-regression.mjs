#!/usr/bin/env node
// Lê o JSON do Semgrep rodado em modo diff-aware (--baseline-commit), que já
// traz APENAS os achados NOVOS em relação ao master, e gera um markdown
// listando as vulnerabilidades introduzidas pela PR. Espelha a UX do
// performance.yml: vira um comentário na PR. Report-only.
//
// Uso: node semgrep-regression.mjs <findings.json>   (> comment.md)

import { readFileSync, existsSync } from 'node:fs';

const [, , file] = process.argv;
if (!file) {
  console.error('Uso: semgrep-regression.mjs <findings.json>');
  process.exit(2);
}

let data = { results: [], errors: [] };
if (existsSync(file)) {
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    /* mantém vazio — tratado como "sem achados" abaixo */
  }
}

const results = Array.isArray(data.results) ? data.results : [];
const SEV = {
  ERROR:   { emoji: '🔴', label: 'Alta' },
  WARNING: { emoji: '🟠', label: 'Média' },
  INFO:    { emoji: '🟡', label: 'Baixa' },
};
const ORDER = ['ERROR', 'WARNING', 'INFO'];

const lines = ['# 🔒 Regressão de segurança (Semgrep diff vs `master`)', ''];

if (results.length === 0) {
  lines.push('**✅ Sem regressão** — nenhum achado novo de vulnerabilidade introduzido por esta PR.');
  if (Array.isArray(data.errors) && data.errors.length) {
    lines.push('', `> ⚠️ ${data.errors.length} erro(s) de scan do Semgrep (regra/parse) — veja o log do job.`);
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

const bySev = { ERROR: [], WARNING: [], INFO: [] };
for (const r of results) {
  const sev = String(r.extra?.severity || 'INFO').toUpperCase();
  (bySev[sev] || bySev.INFO).push(r);
}

const counts = ORDER.filter((s) => bySev[s].length)
  .map((s) => `${bySev[s].length} ${SEV[s].label.toLowerCase()}`)
  .join(' · ');
lines.push(`**🔴 ${results.length} novo(s) achado(s) de vulnerabilidade** (${counts}). Revise antes do merge.`, '');

for (const sev of ORDER) {
  const rs = bySev[sev];
  if (!rs.length) continue;
  lines.push(`### ${SEV[sev].emoji} ${SEV[sev].label} (${sev})`, '');
  for (const r of rs) {
    const rule = String(r.check_id || 'regra').split('.').pop();
    const loc = `${r.path}:${r.start?.line ?? '?'}`;
    const cwe = (r.extra?.metadata?.cwe || []).join(', ');
    const msg = String(r.extra?.message || '').trim().replace(/\s+/g, ' ');
    lines.push(`- **${rule}** — \`${loc}\`${cwe ? ` · ${cwe}` : ''}`);
    if (msg) lines.push(`  ${msg.length > 200 ? msg.slice(0, 200) + '…' : msg}`);
  }
  lines.push('');
}

lines.push('<sub>Semgrep diff-aware (`--baseline-commit`) — só achados ausentes no `master`. Report-only (não bloqueia o merge).</sub>');
process.stdout.write(lines.join('\n') + '\n');
process.exit(0);
