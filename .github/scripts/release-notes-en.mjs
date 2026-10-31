// Notas do release em inglês, com links absolutos para o GitHub: prontas para
// colar fora dele (o tópico do tema no discuss.flarum.org, por exemplo).
//
// Os PRs vêm do histórico git desde a última tag ("Merge pull request #N" e o
// "(#N)" dos squash) e cada um é lido na API. O título em inglês sai da linha
// "EN: …" da descrição do PR; sem ela, vai o título do PR. As categorias são
// as mesmas labels do .github/release-drafter.yml, na mesma ordem.
//
// Entrada (env): GITHUB_TOKEN, GITHUB_REPOSITORY, VERSION, LATEST_TAG (vazia
// no primeiro release), MIGRATE ("true"/"false"), OUTPUT (arquivo de saída).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const { GITHUB_TOKEN, GITHUB_REPOSITORY, VERSION, LATEST_TAG = '', MIGRATE = 'false', OUTPUT } = process.env;

if (!GITHUB_REPOSITORY || !VERSION || !OUTPUT) {
  console.error('::error::GITHUB_REPOSITORY, VERSION e OUTPUT são obrigatórios.');
  process.exit(1);
}

const repoUrl = `https://github.com/${GITHUB_REPOSITORY}`;
const tag = `v${VERSION}`;

const CATEGORIES = [
  ['BC', '⚠️ Breaking changes'],
  ['melhoria', '🔨 Improvements'],
  ['correcao', '🐞 Bug fixes'],
  ['performance', '🚀 Performance'],
  ['documentacao', '📖 Documentation'],
  ['refatoracao', '♻️ Refactoring'],
  ['dependencias', '📦 Dependencies'],
  ['traducao', '🌍 Translations'],
  ['manutencao', '🔧 Maintenance'],
];
const EXCLUDE = 'pular changelog';

/** Os números dos PRs mesclados no intervalo, do mais novo ao mais antigo. */
function prNumbers() {
  const range = LATEST_TAG ? `${LATEST_TAG}..HEAD` : 'HEAD';
  const subjects = execFileSync('git', ['log', '--format=%s', range], { encoding: 'utf8' }).split('\n');
  const numbers = [];

  for (const subject of subjects) {
    const found = subject.match(/^Merge pull request #(\d+)/)?.[1] ?? subject.match(/\(#(\d+)\)\s*$/)?.[1];

    if (found && !numbers.includes(Number(found))) numbers.push(Number(found));
  }

  return numbers;
}

async function fetchPr(number) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${number}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return response.json();
}

/** "EN: …" numa linha própria da descrição (também dentro de um comentário HTML). */
function englishTitle(pr) {
  const match = (pr.body || '').match(/^[ \t]*(?:<!--[ \t]*)?EN[ \t]*:[ \t]*(.+?)[ \t]*(?:-->)?[ \t]*$/im);

  return (match?.[1] || pr.title).trim();
}

function line(pr) {
  return `- ${englishTitle(pr)} ([#${pr.number}](${pr.html_url})) by [@${pr.user.login}](${pr.user.html_url})`;
}

const prs = [];

for (const number of prNumbers()) {
  try {
    const pr = await fetchPr(number);

    if (!pr.labels.some((label) => label.name === EXCLUDE)) prs.push(pr);
  } catch (error) {
    // Um PR que não veio não derruba o release: só fica de fora das notas.
    console.log(`::warning::PR #${number} não entrou nas notas em inglês (${error.message}).`);
  }
}

const out = [`## What's new in the Avocado theme 🌟`, ''];
const placed = new Set();

// Sem categoria primeiro, como o release-drafter faz.
const uncategorized = prs.filter((pr) => !pr.labels.some((label) => CATEGORIES.some(([name]) => name === label.name)));

if (uncategorized.length) {
  uncategorized.forEach((pr) => {
    out.push(line(pr));
    placed.add(pr.number);
  });
  out.push('');
}

for (const [label, title] of CATEGORIES) {
  const items = prs.filter((pr) => !placed.has(pr.number) && pr.labels.some((l) => l.name === label));

  if (!items.length) continue;

  out.push(`### ${title}`, '');
  items.forEach((pr) => {
    out.push(line(pr));
    placed.add(pr.number);
  });
  out.push('');
}

if (!prs.length) out.push('- No pull requests in this release.', '');

out.push('## 📦 How to update', '');

// Blockquote simples, e não o "[!IMPORTANT]" do GitHub: fora dele, o alerta
// apareceria como texto cru.
if (MIGRATE === 'true') out.push('> **Note:** this version changes the database. Run `php flarum migrate` after updating.', '');

out.push('```bash', `composer require ramon/avocado:${VERSION}`);
if (MIGRATE === 'true') out.push('php flarum migrate');
out.push('php flarum cache:clear', 'php flarum assets:publish', '```', '');

if (LATEST_TAG) out.push(`**Full changelog:** ${repoUrl}/compare/${LATEST_TAG}...${tag}`, '');
out.push(`**Release:** ${repoUrl}/releases/tag/${tag}`);

fs.writeFileSync(OUTPUT, `${out.join('\n')}\n`);
console.log(`${prs.length} PR(s) nas notas em inglês.`);
