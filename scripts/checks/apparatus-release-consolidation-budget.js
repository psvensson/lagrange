/**
 * Acceptance budget for the `apparatus-release-consolidation` epic.
 *
 *   node scripts/checks/apparatus-release-consolidation-budget.js [--metric] [--json]
 *
 * Measures every budget in solve/epics/apparatus-release-consolidation.md
 * against a tree and prints a table. The last stdout line is the number of
 * unmet budgets, which is the epic's `doneWhen` metric; exit code is 0 when
 * that number is 0. `--metric` prints only the number; `--json` prints the
 * measurements.
 *
 * Budgets that need evidence from outside the tree read the compact text
 * files their quests commit: data/releases/<tag>.json (publication receipt)
 * and data/formation-health/trend.ndjson (one record per scheduled run).
 *
 * Change a number here and in the epic table together, never in one place.
 *
 * The measuring half takes the tree root as an argument and is exported, so
 * the rows can be witnessed against a fixture tree rather than against this
 * repository, whose counts move for unrelated reasons
 * (test/scripts/apparatus-release-consolidation-budget.test.js).
 *
 * This file lives under scripts/checks, so it is governed by the
 * ambient-intrinsic audit: every prototype method it uses is captured at
 * module load, where the binding cannot be swapped out from under a
 * measurement.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {receiptVerdicts} from './release-publication-receipt.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringTrim = Function.call.bind(String.prototype.trim);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UNKNOWN_VERDICT = 'unknown';
const TREND_WINDOW = 3;

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

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const EMPTY_TEXT = '';
const ARGV_OFFSET = 2;
const JSON_FLAG = '--json';
const METRIC_FLAG = '--metric';
const JSON_INDENT = 2;
const VALUE_COLUMN_WIDTH = 7;
const MET_MARK = 'ok  ';
const UNMET_MARK = 'OVER';
const BUDGET_SEPARATOR = '  / ';
const COLUMN_GAP = '  ';
const EXIT_OK = 0;
const EXIT_OVER_BUDGET = 1;

const FRONT_MATTER_MARKER = '---';
const FRONT_MATTER_ENTRY = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/u;
const STATUS_OPEN = 'open';
const LEGACY_TRUE = 'true';
const DONE_WHEN_KEY = 'doneWhen';

const EPICS_DIR = 'solve/epics';
const SCRIPTS_DIR = 'scripts';
const CHECKS_DIR = 'scripts/checks';
const WORKFLOWS_DIR = '.github/workflows';
const SRC_DIR = 'src';
const TREND_FILE = 'data/formation-health/trend.ndjson';
const RELEASE_WORKFLOW = '.github/workflows/release.yml';
const FAST_STATIC_SCRIPT = 'scripts/check-fast-static.js';
const PACKAGE_MANIFEST = 'package.json';
const CLAUDE_MD = 'CLAUDE.md';
const AGENTS_MD = 'AGENTS.md';
const README_MD = 'README.md';

const MARKDOWN_SUFFIX = '.md';
const METHODS_SUFFIX = '-methods.js';

const LITERALS_CHECKER_FRAGMENT = 'guideline:literals';
const FILE_LENGTH_AUDIT_FRAGMENT = 'file-size';
const LIFERAFT_DEPENDENCY = 'liferaft';
const GLOBAL_INSTALL_LINE = 'npm install --global lagrange-server';
const PACKAGE_NAME = 'lagrange-server';
const VERSION_TAG_PREFIX = /^v/u;
const NAMED_STEP = /^\s+- name:/gmu;
const NPM_RUN_TOKEN = /npm run ([A-Za-z0-9:_-]+)/gu;
const CLUSTER_CLAIM = /five[- ]node/iu;
const DATED_FORMATION_VERDICT = /formation health[^\n]*\d{4}-\d{2}-\d{2}/iu;

// The gates a change must pass: the push gate, the full static corpus the
// release proof runs, and the attempt preflight. Expanded transitively
// through `npm run <name>` tokens; `check-fast-static.js` names its audits in
// source, so its text is scanned too.
const GATE_ROOTS = Object.freeze(['check', 'test:static', 'audit:attempt-preflight']);

function abs(root, rel) {
  return path.join(root, rel);
}

function exists(root, rel) {
  return fs.existsSync(abs(root, rel));
}

function read(root, rel) {
  return fs.readFileSync(abs(root, rel), TEXT_ENCODING);
}

function lineCount(root, rel) {
  const text = read(root, rel);
  if (text.length === 0) return 0;
  return stringSplit(text, LINE_SEPARATOR).length -
    (stringEndsWith(text, LINE_SEPARATOR) ? 1 : 0);
}

function walk(root, rel, visit) {
  const dir = abs(root, rel);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const child = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) walk(root, child, visit);
    else if (entry.isFile()) visit(child);
  }
}

function filesUnder(root, rel) {
  const out = [];
  walk(root, rel, (file) => out.push(file));
  return out;
}

function totalLines(root, rel) {
  let total = 0;
  walk(root, rel, (file) => {
    total += lineCount(root, file);
  });
  return total;
}

function looseFiles(root, rel) {
  const dir = abs(root, rel);
  if (!fs.existsSync(dir)) return 0;
  return arrayFilter(
    fs.readdirSync(dir, {withFileTypes: true}), (e) => e.isFile()).length;
}

// Minimal front-matter reader: top-level `key: value` lines between the
// first two `---` markers. Enough for status/legacy/doneWhen presence.
function frontMatter(root, rel) {
  const lines = stringSplit(read(root, rel), LINE_SEPARATOR);
  if (lines[0] !== FRONT_MATTER_MARKER) return null;
  const end = arrayIndexOf(lines, FRONT_MATTER_MARKER, 1);
  if (end < 0) return null;
  const front = {};
  for (const line of lines.slice(1, end)) {
    const match = FRONT_MATTER_ENTRY.exec(line);
    if (match) front[match[1]] = stringTrim(match[2]);
  }
  return front;
}

function epicStats(root) {
  let open = 0;
  let openLegacy = 0;
  let openWithoutDoneWhen = 0;
  for (const file of filesUnder(root, EPICS_DIR)) {
    if (!stringEndsWith(file, MARKDOWN_SUFFIX) ||
      path.posix.dirname(file) !== EPICS_DIR) continue;
    const front = frontMatter(root, file);
    if (!front || front.status !== STATUS_OPEN) continue;
    open += 1;
    if (front.legacy === LEGACY_TRUE) openLegacy += 1;
    if (!(DONE_WHEN_KEY in front)) openWithoutDoneWhen += 1;
  }
  return {open, openLegacy, openWithoutDoneWhen};
}

function checkChainMentions(root, fragment) {
  if (exists(root, FAST_STATIC_SCRIPT) &&
    stringIncludes(read(root, FAST_STATIC_SCRIPT), fragment)) return true;
  const pkg = JSON.parse(read(root, PACKAGE_MANIFEST));
  const scripts = pkg.scripts || {};
  const seen = new Set();
  const queue = [...GATE_ROOTS];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name) || typeof scripts[name] !== 'string') continue;
    seen.add(name);
    const body = scripts[name];
    if (stringIncludes(body, fragment)) return true;
    for (const match of body.matchAll(NPM_RUN_TOKEN)) queue.push(match[1]);
  }
  return false;
}

function namedSteps(root, rel) {
  if (!exists(root, rel)) return 0;
  return (read(root, rel).match(NAMED_STEP) || []).length;
}

function methodsFiles(root) {
  return arrayFilter(filesUnder(root, SRC_DIR),
    (f) => stringEndsWith(f, METHODS_SUFFIX)).length;
}

function dependsOn(root, name) {
  const pkg = JSON.parse(read(root, PACKAGE_MANIFEST));
  const all = {...(pkg.dependencies || {}), ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {})};
  return arraySome(Object.keys(all), (key) => stringIncludes(key, name));
}

// The receipt owner decides what "published" means; this row only counts.
function releaseReceipt(root) {
  const verdicts = receiptVerdicts(root);
  return {
    receipt: verdicts.receipt,
    published: arrayFilter(verdicts.rows, (row) => row.published).length,
    artifacts: verdicts.rows.length,
  };
}

function measuringTrendRecords(root) {
  if (!exists(root, TREND_FILE)) return 0;
  const lines = arrayFilter(
    stringSplit(read(root, TREND_FILE), LINE_SEPARATOR),
    (line) => stringTrim(line).length > 0);
  const records = arrayMap(lines.slice(-TREND_WINDOW), (line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  });
  return arrayFilter(records, (record) => record &&
    !arraySome(Object.values(record), (value) =>
      typeof value === 'string' &&
        stringToLowerCase(value) === UNKNOWN_VERDICT)).length;
}

function claudeMdIsPointer(root) {
  if (!exists(root, CLAUDE_MD)) return false;
  return lineCount(root, CLAUDE_MD) <= BUDGET.CLAUDE_MD_LINES &&
    stringIncludes(read(root, CLAUDE_MD), AGENTS_MD);
}

// A README offence: an install line without the version the newest receipt
// names, or a formation claim without a dated verdict. Counted only once a
// receipt exists; before that the release quest owns the gap.
function readmeOffences(root, receipt) {
  if (!exists(root, README_MD)) return 1;
  const readme = read(root, README_MD);
  let offences = 0;
  if (receipt && receipt.tag) {
    const version = stringReplace(String(receipt.tag), VERSION_TAG_PREFIX, EMPTY_TEXT);
    if (stringIncludes(readme, GLOBAL_INSTALL_LINE) &&
      !stringIncludes(readme, `${PACKAGE_NAME}@${version}`)) offences += 1;
  }
  const claimsCluster = CLUSTER_CLAIM.test(readme);
  const datedVerdict = DATED_FORMATION_VERDICT.test(readme);
  if (claimsCluster && !datedVerdict) offences += 1;
  return offences;
}

const atMost = (value, budget) => value <= budget;
const atLeast = (value, budget) => value >= budget;

/**
 * Measure every budget row against one tree.
 * @param {string} root absolute path to the tree to measure
 * @returns {Array<{name: string, value: number, budget: number, met: boolean}>}
 *   one row per budget, in the sealed table's order
 */
function measureConsolidationBudget(root = REPO_ROOT) {
  const release = releaseReceipt(root);
  const receipt = release.receipt;
  const epics = epicStats(root);
  const rows = [
    ['release receipt: artifacts published',
      release.published, release.artifacts, atLeast],
    ['formation trend: measuring verdicts in last 3',
      measuringTrendRecords(root), TREND_WINDOW, atLeast],
    ['README offences', readmeOffences(root, receipt), 0, atMost],
    ['scripts/ loose top-level files',
      looseFiles(root, SCRIPTS_DIR), BUDGET.LOOSE_SCRIPTS, atMost],
    ['scripts/ total lines',
      totalLines(root, SCRIPTS_DIR), BUDGET.SCRIPTS_LINES, atMost],
    ['scripts/checks files',
      filesUnder(root, CHECKS_DIR).length, BUDGET.CHECKS_FILES, atMost],
    ['.github/workflows total lines',
      totalLines(root, WORKFLOWS_DIR), BUDGET.WORKFLOW_LINES, atMost],
    ['release.yml named steps',
      namedSteps(root, RELEASE_WORKFLOW), BUDGET.RELEASE_STEPS, atMost],
    ['gate chains reference literals checker',
      checkChainMentions(root, LITERALS_CHECKER_FRAGMENT) ? 1 : 0, 0, atMost],
    ['gate chains reference file-length audit',
      checkChainMentions(root, FILE_LENGTH_AUDIT_FRAGMENT) ? 1 : 0, 0, atMost],
    ['src *-methods.js files', methodsFiles(root), BUDGET.METHODS_FILES, atMost],
    ['open epics', epics.open, BUDGET.OPEN_EPICS, atMost],
    ['open legacy epics', epics.openLegacy, BUDGET.OPEN_LEGACY_EPICS, atMost],
    ['open epics without doneWhen', epics.openWithoutDoneWhen, 0, atMost],
    ['solve/epics total lines',
      totalLines(root, EPICS_DIR), BUDGET.EPICS_LINES, atMost],
    ['liferaft dependency present',
      dependsOn(root, LIFERAFT_DEPENDENCY) ? 1 : 0, 0, atMost],
    ['CLAUDE.md is a pointer', claudeMdIsPointer(root) ? 0 : 1, 0, atMost],
  ];
  return arrayMap(rows,
    ([name, value, budget, ok]) => ({name, value, budget, met: ok(value, budget)}));
}

function renderTable(rows) {
  const width = Math.max(...arrayMap(rows, (row) => row.name.length));
  let text = EMPTY_TEXT;
  for (const row of rows) {
    const mark = row.met ? MET_MARK : UNMET_MARK;
    const value = stringPadStart(String(row.value), VALUE_COLUMN_WIDTH);
    text += `${mark} ${stringPadEnd(row.name, width)}${COLUMN_GAP}` +
      `${value}${BUDGET_SEPARATOR}${row.budget}${LINE_SEPARATOR}`;
  }
  return text;
}

function main(argv) {
  const rows = measureConsolidationBudget();
  const unmet = arrayFilter(rows, (row) => !row.met).length;
  if (arrayIncludes(argv, JSON_FLAG)) {
    process.stdout.write(
      `${JSON.stringify({rows, unmet}, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  } else if (!arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(renderTable(rows));
  }
  process.stdout.write(`${unmet}${LINE_SEPARATOR}`);
  return unmet === 0 ? EXIT_OK : EXIT_OVER_BUDGET;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {measureConsolidationBudget};
