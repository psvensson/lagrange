/**
 * Acceptance budget for the `apparatus-release-consolidation` epic.
 *
 *   node scripts/checks/apparatus-release-consolidation-budget.js [--metric] [--json]
 *
 * Measures every budget in solve/epics/apparatus-release-consolidation.md
 * against the working tree and prints a table. The last stdout line is the
 * number of unmet budgets, which is the epic's `doneWhen` metric; exit code is
 * 0 when that number is 0. `--metric` prints only the number; `--json` prints
 * the measurements.
 *
 * Budgets that need evidence from outside the tree read the compact text
 * files their quests commit: data/releases/<tag>.json (publication receipt)
 * and data/formation-health/trend.ndjson (one record per scheduled run).
 *
 * Change a number here and in the epic table together, never in one place.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UNKNOWN_VERDICT = 'unknown';
const TREND_WINDOW = 3;
const ARTIFACTS = Object.freeze(['npm', 'docker', 'helm', 'github']);

const BUDGET = Object.freeze({
  LOOSE_SCRIPTS: 80,
  SCRIPTS_LINES: 90000,
  CHECKS_FILES: 190,
  WORKFLOW_LINES: 500,
  RELEASE_STEPS: 12,
  METHODS_FILES: 160,
  OPEN_EPICS: 8,
  OPEN_LEGACY_EPICS: 0,
  EPICS_LINES: 6000,
  CLAUDE_MD_LINES: 3,
});

function abs(rel) {
  return path.join(REPO_ROOT, rel);
}

function exists(rel) {
  return fs.existsSync(abs(rel));
}

function read(rel) {
  return fs.readFileSync(abs(rel), 'utf8');
}

function lineCount(rel) {
  const text = read(rel);
  if (text.length === 0) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function walk(rel, visit) {
  const dir = abs(rel);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const child = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) walk(child, visit);
    else if (entry.isFile()) visit(child);
  }
}

function filesUnder(rel) {
  const out = [];
  walk(rel, (file) => out.push(file));
  return out;
}

function totalLines(rel) {
  let total = 0;
  walk(rel, (file) => { total += lineCount(file); });
  return total;
}

function looseFiles(rel) {
  const dir = abs(rel);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, {withFileTypes: true}).filter((e) => e.isFile()).length;
}

// Minimal front-matter reader: top-level `key: value` lines between the
// first two `---` markers. Enough for status/legacy/doneWhen presence.
function frontMatter(rel) {
  const lines = read(rel).split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const front = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/u.exec(line);
    if (match) front[match[1]] = match[2].trim();
  }
  return front;
}

function epicStats() {
  let open = 0;
  let openLegacy = 0;
  let openWithoutDoneWhen = 0;
  for (const file of filesUnder('solve/epics')) {
    if (!file.endsWith('.md') || path.posix.dirname(file) !== 'solve/epics') continue;
    const front = frontMatter(file);
    if (!front || front.status !== 'open') continue;
    open += 1;
    if (front.legacy === 'true') openLegacy += 1;
    if (!('doneWhen' in front)) openWithoutDoneWhen += 1;
  }
  return {open, openLegacy, openWithoutDoneWhen};
}

// The gates a change must pass: the push gate, the full static corpus the
// release proof runs, and the attempt preflight. Expanded transitively
// through `npm run <name>` tokens; `check-fast-static.js` names its audits in
// source, so its text is scanned too.
const GATE_ROOTS = Object.freeze(['check', 'test:static', 'audit:attempt-preflight']);

function checkChainMentions(fragment) {
  if (exists('scripts/check-fast-static.js') &&
    read('scripts/check-fast-static.js').includes(fragment)) return true;
  const pkg = JSON.parse(read('package.json'));
  const scripts = pkg.scripts || {};
  const seen = new Set();
  const queue = [...GATE_ROOTS];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name) || typeof scripts[name] !== 'string') continue;
    seen.add(name);
    const body = scripts[name];
    if (body.includes(fragment)) return true;
    for (const match of body.matchAll(/npm run ([A-Za-z0-9:_-]+)/gu)) queue.push(match[1]);
  }
  return false;
}

function namedSteps(rel) {
  if (!exists(rel)) return 0;
  return (read(rel).match(/^\s+- name:/gmu) || []).length;
}

function methodsFiles() {
  return filesUnder('src').filter((f) => f.endsWith('-methods.js')).length;
}

function dependsOn(name) {
  const pkg = JSON.parse(read('package.json'));
  const all = {...(pkg.dependencies || {}), ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {})};
  return Object.keys(all).some((key) => key.includes(name));
}

function newestReleaseReceipt() {
  const dir = 'data/releases';
  const files = filesUnder(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) return null;
  try {
    return JSON.parse(read(files[files.length - 1]));
  } catch {
    return null;
  }
}

function receiptPublishedCount(receipt) {
  if (!receipt || typeof receipt !== 'object') return 0;
  const published = receipt.published || receipt.artifacts || {};
  return ARTIFACTS.filter((name) => {
    const entry = published[name];
    return entry === true || (entry && entry.published === true);
  }).length;
}

function measuringTrendRecords() {
  const rel = 'data/formation-health/trend.ndjson';
  if (!exists(rel)) return 0;
  const records = read(rel).split('\n').filter((line) => line.trim().length > 0)
    .slice(-TREND_WINDOW).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    });
  return records.filter((record) => record &&
    !Object.values(record).some((value) =>
      typeof value === 'string' && value.toLowerCase() === UNKNOWN_VERDICT)).length;
}

function claudeMdIsPointer() {
  if (!exists('CLAUDE.md')) return false;
  return lineCount('CLAUDE.md') <= BUDGET.CLAUDE_MD_LINES &&
    read('CLAUDE.md').includes('AGENTS.md');
}

// A README offence: an install line without the version the newest receipt
// names, or a formation claim without a dated verdict. Counted only once a
// receipt exists; before that the release quest owns the gap.
function readmeOffences(receipt) {
  if (!exists('README.md')) return 1;
  const readme = read('README.md');
  let offences = 0;
  if (receipt && receipt.tag) {
    const version = String(receipt.tag).replace(/^v/u, '');
    if (readme.includes('npm install --global lagrange-server') &&
      !readme.includes(`lagrange-server@${version}`)) offences += 1;
  }
  const claimsCluster = /five[- ]node/iu.test(readme);
  const datedVerdict = /formation health[^\n]*\d{4}-\d{2}-\d{2}/iu.test(readme);
  if (claimsCluster && !datedVerdict) offences += 1;
  return offences;
}

const atMost = (value, budget) => value <= budget;
const atLeast = (value, budget) => value >= budget;

function measure() {
  const receipt = newestReleaseReceipt();
  const epics = epicStats();
  const rows = [
    ['release receipt: artifacts published',
      receiptPublishedCount(receipt), ARTIFACTS.length, atLeast],
    ['formation trend: measuring verdicts in last 3',
      measuringTrendRecords(), TREND_WINDOW, atLeast],
    ['README offences', readmeOffences(receipt), 0, atMost],
    ['scripts/ loose top-level files', looseFiles('scripts'), BUDGET.LOOSE_SCRIPTS, atMost],
    ['scripts/ total lines', totalLines('scripts'), BUDGET.SCRIPTS_LINES, atMost],
    ['scripts/checks files', filesUnder('scripts/checks').length, BUDGET.CHECKS_FILES, atMost],
    ['.github/workflows total lines',
      totalLines('.github/workflows'), BUDGET.WORKFLOW_LINES, atMost],
    ['release.yml named steps',
      namedSteps('.github/workflows/release.yml'), BUDGET.RELEASE_STEPS, atMost],
    ['gate chains reference literals checker',
      checkChainMentions('guideline:literals') ? 1 : 0, 0, atMost],
    ['gate chains reference file-length audit',
      checkChainMentions('file-size') ? 1 : 0, 0, atMost],
    ['src *-methods.js files', methodsFiles(), BUDGET.METHODS_FILES, atMost],
    ['open epics', epics.open, BUDGET.OPEN_EPICS, atMost],
    ['open legacy epics', epics.openLegacy, BUDGET.OPEN_LEGACY_EPICS, atMost],
    ['open epics without doneWhen', epics.openWithoutDoneWhen, 0, atMost],
    ['solve/epics total lines', totalLines('solve/epics'), BUDGET.EPICS_LINES, atMost],
    ['liferaft dependency present', dependsOn('liferaft') ? 1 : 0, 0, atMost],
    ['CLAUDE.md is a pointer', claudeMdIsPointer() ? 0 : 1, 0, atMost],
  ];
  return rows.map(([name, value, budget, ok]) => ({name, value, budget, met: ok(value, budget)}));
}

function main(argv) {
  const rows = measure();
  const unmet = rows.filter((row) => !row.met).length;
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({rows, unmet}, null, 2)}\n`);
  } else if (!argv.includes('--metric')) {
    const width = Math.max(...rows.map((row) => row.name.length));
    for (const row of rows) {
      const mark = row.met ? 'ok  ' : 'OVER';
      const value = String(row.value).padStart(7);
      process.stdout.write(`${mark} ${row.name.padEnd(width)}  ${value}  / ${row.budget}\n`);
    }
  }
  process.stdout.write(`${unmet}\n`);
  process.exitCode = unmet === 0 ? 0 : 1;
}

main(process.argv.slice(2));
