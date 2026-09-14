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
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {observationDrift} from './test-subsystem-classification.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {isMeasuringVerdict} from './formation-health.js';
import {receiptVerdicts} from './release-publication-receipt.js';

const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringMatchAll = Function.call.bind(String.prototype.matchAll);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TREND_WINDOW = 3;

const BUDGET = Object.freeze({
  LOOSE_SCRIPTS: 80,
  SCRIPTS_LINES: 90000,
  CHECKS_FILES: 190,
  WORKFLOW_LINES: 500,
  RELEASE_STEPS: 12,
  METHODS_FILES: 160,
  OPEN_EPICS: 12,
  OPEN_LEGACY_EPICS: 0,
  EPICS_LINES: 6000,
  CLAUDE_MD_LINES: 3,
});

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const EMPTY_TEXT = '';
const ARGV_OFFSET = 2;
const JSON_FLAG = '--json';
const ROWS_FLAG = '--rows';
// proof-authority-integrity rows: the gate's declared stage manifest, the
// committed observation census, and the falsifier receipt.
const PRE_PUSH_STAGES_MANIFEST = 'test/manifests/pre-push-stages.json';
const SUBSYSTEM_MANIFEST = 'test/shards/subsystem-classes.json';
const FALSIFIER_RECEIPT = 'test/manifests/proof-authority-falsifiers.receipt.json';
const FALSIFIER_CLASSES = Object.freeze([
  'observed-file', 'observed-directory', 'spawned-script',
  'behavioural-source', 'working-tree-not-proof',
  'hook-materialises-pushed-sha',
]);
const RECEIPT_DIGESTS_FIELD = 'testFileDigests';
// gate-work-consolidation rows: every proof produced once per push cycle.
const PACKAGE_SCRIPTS_MANIFEST = 'package.json';
const PRE_COMMIT_HOOK = '.githooks/pre-commit';
const PRE_PUSH_HOOK = '.githooks/pre-push';
const STATIC_AUDITS_MODULE = 'scripts/checks/run-static-audits.js';
const CORPUS_WORKTREE_MODULE = 'scripts/checks/push-gate-corpus-worktree.js';
const FAST_STATIC_MODULE = 'scripts/check-fast-static.js';
const OWNER_DEBT_CONSTANTS = 'scripts/global-owner-debt-inventory/constants.js';
const POSTPUSH_MANIFEST =
  'test/manifests/project-hardening-proof-postpush-manifest.json';
const SAFETY_SPINE = 'test/shards/safety-spine.json';
const PROOF_OBLIGATIONS = 'test/manifests/proof-obligations.json';
const CI_RESOURCE_PLAN = 'test/manifests/ci-resource-plan.json';
const REPOSITORY_HEALTH_WORKFLOW = '.github/workflows/repository-health.yml';
const CANARY_WORKFLOW = '.github/workflows/full-corpus-canary.yml';
const CI_WORKFLOW = '.github/workflows/ci.yml';
const WORKFLOW_SUFFIX = '.yml';
// The whole-tree metric checkers, by the file that produces each metric.
const METRIC_CHECKERS = Object.freeze([
  'check-complexity.js',
  'check-cognitive-complexity.js',
  'check-circular-dependencies.js',
  'check-duplication.js',
  'check-file-size-thresholds.js',
  'check-unused-exports.js',
]);
// A run that measures only the changed files is not a production of the
// whole-tree metric.
const SCOPED_MARKERS = Object.freeze(['--scoped', 'check-scoped-ratchets.js']);
const NPM_RUN_PATTERN = /npm run (?:-s )?([A-Za-z0-9:_-]+)/gu;
const STATIC_AUDIT_LIST_PATTERN =
  /STATIC_AUDIT_SCRIPTS = Object\.freeze\(\[([\s\S]*?)\]\)/u;
const QUOTED_PATTERN = /'([^']+)'/gu;
const SEAL_READER_MARKERS = Object.freeze(['IMPORT_GRAPH_SEAL_PATH', 'snapshotDigest']);
const SEAL_PRODUCER = 'scripts/generate-global-owner-debt-inventory.js';
const FOCUSED_CONTRACTS_ID = 'focused-contracts';
const TEST_SUFFIX = '.test.js';
const TRACKED_LINT_MARKER = 'git ls-files -z';
const CONCURRENCY_MARKER = /^concurrency:/mu;
const JOB_HEADER_PATTERN = /^ {2}([A-Za-z0-9_-]+):\s*$/gmu;
const TIMEOUT_PATTERN = /timeout-minutes:\s*(\d+)/u;
const RUNS_ON_PATTERN = /runs-on:\s*(.+)$/mu;
const CANARY_SIGNAL_MARKERS = Object.freeze(['workflow_run', 'full-corpus']);
const NEWLINE = '\n';
const ARGUMENT_SEPARATOR = ' ';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const TREE_PUSHED_SHA = 'pushed-sha';
const TREE_NONE = 'none';
const RECEIPT_PASSED_FIELD = 'passed';
const ROW_WORD_SEPARATOR = '_';
const UNKNOWN_ROW_PREFIX = 'unknown budget row: ';
const UNKNOWN_ROW_VALUE = 1;
const UNKNOWN_ROW_BUDGET = 0;
const ROW_WORD_SPACE = ' ';
const ROW_SEPARATOR = ',';
const EMPTY_ROWS = '';
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

function readJsonOrNull(root, rel) {
  try {
    return JSON.parse(read(root, rel));
  } catch {
    return null;
  }
}

// Stages the hook declares to read anything but the pushed sha (a missing
// manifest is one undeclared gate).
function gateStagesOffPushedSha(root) {
  const manifest = readJsonOrNull(root, PRE_PUSH_STAGES_MANIFEST);
  if (!manifest || !Array.isArray(manifest.stages)) return 1;
  return arrayFilter(manifest.stages,
    (stage) => stage.tree !== TREE_PUSHED_SHA && stage.tree !== TREE_NONE).length;
}

// Tests whose live observation surfaces differ from the committed census.
function undeclaredObservationSurfaces(root) {
  const manifest = readJsonOrNull(root, SUBSYSTEM_MANIFEST);
  if (!manifest || !manifest.observations) return 1;
  return observationDrift(root, manifest).length;
}

// A receipt speaks for the witness bytes it ran: its recorded digest of the
// witness file must be the file's digest now, or the receipt is of an older
// witness and proves nothing about this tree.
function receiptBindsWitness(root, receipt, entry) {
  const digests = receipt?.[RECEIPT_DIGESTS_FIELD];
  const file = entry?.testFile ?? null;
  if (!digests || typeof file !== 'string' ||
      typeof digests[file] !== 'string') return false;
  try {
    const current = createHash(DIGEST_ALGORITHM)
      .update(fs.readFileSync(abs(root, file))).digest(DIGEST_ENCODING);
    return current === digests[file];
  } catch {
    return false;
  }
}

// Falsifier classes without a passing receipt bound to the current witness.
function falsifierClassesUnproven(root) {
  const receipt = readJsonOrNull(root, FALSIFIER_RECEIPT);
  const receipts = Array.isArray(receipt?.receipts) ? receipt.receipts : [];
  return arrayFilter(FALSIFIER_CLASSES, (id) =>
    !arraySome(receipts, (entry) =>
      entry.id === id && entry[RECEIPT_PASSED_FIELD] === true &&
      receiptBindsWitness(root, receipt, entry))).length;
}

// --- gate-work-consolidation rows -------------------------------------------

function readText(root, rel) {
  try {
    return read(root, rel);
  } catch {
    return '';
  }
}

// The command text an npm script expands to, following `npm run` chains.
function expandScript(scripts, name, seen = Object.create(null)) {
  if (seen[name] === true || typeof scripts[name] !== 'string') return '';
  seen[name] = true;
  let text = scripts[name];
  for (const match of stringMatchAll(scripts[name], NPM_RUN_PATTERN)) {
    text += NEWLINE + expandScript(scripts, match[1], seen);
  }
  return text;
}

// Every command text a surface runs, npm chains expanded.
function surfaceText(scripts, text) {
  let expanded = text;
  for (const match of stringMatchAll(text, NPM_RUN_PATTERN)) {
    expanded += NEWLINE + expandScript(scripts, match[1]);
  }
  return expanded;
}

function staticAuditScripts(root) {
  const match = STATIC_AUDIT_LIST_PATTERN.exec(readText(root, STATIC_AUDITS_MODULE));
  if (!match) return [];
  const names = [];
  for (const quoted of stringMatchAll(match[1], QUOTED_PATTERN)) {
    names.push(quoted[1]);
  }
  return names;
}

function packageScripts(root) {
  const manifest = readJsonOrNull(root, PACKAGE_SCRIPTS_MANIFEST);
  return manifest && manifest.scripts && typeof manifest.scripts === 'object' ?
    manifest.scripts : {};
}

// The per-push-cycle surfaces that may execute a whole-tree checker: the two
// hooks (with the modules the push hook delegates to), the post-push static
// audits, the owner-debt refresh, the fast-static layer ci runs, and each
// workflow. Scoped runs are dropped before counting.
function metricSurfaces(root) {
  const scripts = packageScripts(root);
  const audits = staticAuditScripts(root);
  const surfaces = [
    readText(root, PRE_COMMIT_HOOK),
    readText(root, PRE_PUSH_HOOK) + NEWLINE + readText(root, CORPUS_WORKTREE_MODULE),
    arrayJoin(arrayMap(audits, (name) => `npm run ${name}`), NEWLINE),
    readText(root, OWNER_DEBT_CONSTANTS),
    readText(root, FAST_STATIC_MODULE),
  ];
  const workflows = filesUnder(root, WORKFLOWS_DIR);
  for (const workflow of workflows) {
    if (stringEndsWith(workflow, WORKFLOW_SUFFIX)) surfaces.push(readText(root, workflow));
  }
  return arrayMap(surfaces, (text) => {
    const lines = arrayFilter(stringSplit(surfaceText(scripts, text), NEWLINE),
      (line) => !arraySome(SCOPED_MARKERS, (marker) => stringIncludes(line, marker)));
    return arrayJoin(lines, NEWLINE);
  });
}

// Sum over metrics of productions beyond the first.
function duplicateMetricProductions(root) {
  const surfaces = metricSurfaces(root);
  let duplicates = 0;
  for (const checker of METRIC_CHECKERS) {
    const productions = arrayFilter(surfaces,
      (text) => stringIncludes(text, checker)).length;
    if (productions > 1) duplicates += productions - 1;
  }
  return duplicates;
}

// Tests both in the safety spine and in the focused-contracts command.
function duplicateFixedTestRuns(root) {
  const spine = readJsonOrNull(root, SAFETY_SPINE);
  const manifest = readJsonOrNull(root, POSTPUSH_MANIFEST);
  const spineTests = Array.isArray(spine?.tests) ? spine.tests : [];
  const focused = arrayFind(Array.isArray(manifest?.commands) ? manifest.commands : [],
    (command) => command.id === FOCUSED_CONTRACTS_ID);
  const focusedTests = arrayFilter(Array.isArray(focused?.argv) ? focused.argv : [],
    (argument) => stringEndsWith(argument, TEST_SUFFIX));
  return arrayFilter(focusedTests,
    (testPath) => arrayIncludes(spineTests, testPath)).length;
}

// Modules under scripts/ that bind the import-graph seal, beyond one reader
// (the producer writes it and is not a reader).
function importGraphSealReadersBeyondOne(root) {
  let readers = 0;
  for (const file of filesUnder(root, SCRIPTS_DIR)) {
    if (file === SEAL_PRODUCER) continue;
    const text = readText(root, file);
    if (arrayEvery(SEAL_READER_MARKERS, (marker) => stringIncludes(text, marker))) {
      readers += 1;
    }
  }
  return readers > 1 ? readers - 1 : 0;
}

// Whole-tree commands of the gate (the static audits, the model contracts,
// the golden-capability guard, the owner-debt refresh) with no entry in the
// proof-obligation registry naming the inputs that trigger them.
function wholeTreeChecksWithoutInputTrigger(root) {
  const registry = readJsonOrNull(root, PROOF_OBLIGATIONS);
  const obligations = Array.isArray(registry?.obligations) ? registry.obligations : [];
  const declared = Object.create(null);
  for (const obligation of obligations) {
    if (typeof obligation?.command === 'string' &&
        Array.isArray(obligation.inputs) && obligation.inputs.length > 0) {
      declared[obligation.command] = true;
    }
  }
  const manifest = readJsonOrNull(root, POSTPUSH_MANIFEST);
  const commands = [];
  for (const name of staticAuditScripts(root)) commands.push(`npm run ${name}`);
  for (const command of Array.isArray(manifest?.commands) ? manifest.commands : []) {
    if (command.id === FOCUSED_CONTRACTS_ID) continue;
    commands.push(
      `${command.executable} ${arrayJoin(command.argv || [], ARGUMENT_SEPARATOR)}`);
  }
  return arrayFilter(commands, (command) => declared[command] !== true).length;
}

// The push hook lints every tracked file rather than the pushed range.
function eslintOffPushedRange(root) {
  return stringIncludes(readText(root, PRE_PUSH_HOOK), TRACKED_LINT_MARKER) ? 1 : 0;
}

function repositoryHealthNotCoalesced(root) {
  return fs.existsSync(abs(root, REPOSITORY_HEALTH_WORKFLOW)) ? 1 : 0;
}

function workflowsWithoutConcurrency(root) {
  let missing = 0;
  for (const file of filesUnder(root, WORKFLOWS_DIR)) {
    if (!stringEndsWith(file, WORKFLOW_SUFFIX)) continue;
    if (!CONCURRENCY_MARKER.test(readText(root, file))) missing += 1;
  }
  return missing;
}

// Each workflow job's runner and timeout must equal the committed resource
// plan's entry for `<workflow>/<job>`; a job the plan does not know, or one
// whose literals differ, is not plan-driven.
function ciResourcesNotPlanDriven(root) {
  const plan = readJsonOrNull(root, CI_RESOURCE_PLAN);
  const jobs = plan && plan.jobs && typeof plan.jobs === 'object' ? plan.jobs : {};
  let offending = 0;
  for (const file of filesUnder(root, WORKFLOWS_DIR)) {
    if (!stringEndsWith(file, WORKFLOW_SUFFIX)) continue;
    const text = readText(root, file);
    const jobsStart = stringIndexOf(text, `${NEWLINE}jobs:`);
    if (jobsStart < 0) continue;
    const body = text.slice(jobsStart);
    const headers = [...stringMatchAll(body, JOB_HEADER_PATTERN)];
    for (let index = 0; index < headers.length; index += 1) {
      const start = headers[index].index;
      const end = index + 1 < headers.length ? headers[index + 1].index : body.length;
      const jobText = body.slice(start, end);
      const key = `${path.posix.basename(file)}/${headers[index][1]}`;
      const timeout = TIMEOUT_PATTERN.exec(jobText);
      const runsOn = RUNS_ON_PATTERN.exec(jobText);
      const entry = jobs[key];
      if (!entry || !timeout || !runsOn ||
          Number(timeout[1]) !== entry.timeoutMinutes ||
          stringTrim(runsOn[1]) !== entry.runsOn) {
        offending += 1;
      }
    }
  }
  return offending;
}

// The canary must be triggered by the gated ci run and skip when that run
// already proved the whole corpus for the same sha.
function canaryAfterFullCorpus(root) {
  const text = readText(root, CANARY_WORKFLOW);
  if (text.length === 0) return 0;
  return arrayEvery(CANARY_SIGNAL_MARKERS, (marker) => stringIncludes(text, marker)) &&
    stringIncludes(text, path.posix.basename(CI_WORKFLOW)) ? 0 : 1;
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
    isMeasuringVerdict(record.verdict)).length;
}

function claudeMdIsPointer(root) {
  if (!exists(root, CLAUDE_MD)) return false;
  return lineCount(root, CLAUDE_MD) <= BUDGET.CLAUDE_MD_LINES &&
    stringIncludes(read(root, CLAUDE_MD), AGENTS_MD);
}

// A README offence: a formation claim without a dated verdict. The install
// line is deliberately unpinned - `npm install --global lagrange-server`
// installs what npm serves as latest, and a pinned version would go stale on
// every release - so it is no longer an offence (owner decision 2026-09-13).
function readmeOffences(root, _receipt) {
  if (!exists(root, README_MD)) return 1;
  const readme = read(root, README_MD);
  let offences = 0;
  const claimsCluster = CLUSTER_CLAIM.test(readme);
  const datedVerdict = DATED_FORMATION_VERDICT.test(readme);
  if (claimsCluster && !datedVerdict) offences += 1;
  return offences;
}

// The newest receipt records next as observed and whether it trails latest;
// moving it is the release owner's one post-publish action (RELEASE.md).
function nextLagging(receipt) {
  return receipt?.published?.npm?.nextLagging === true ? 1 : 0;
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
    ['release receipt: npm next lags latest', nextLagging(receipt), 0, atMost],
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
    ['gate stages off pushed sha', gateStagesOffPushedSha(root), 0, atMost],
    ['undeclared observation surfaces',
      undeclaredObservationSurfaces(root), 0, atMost],
    ['falsifier classes unproven', falsifierClassesUnproven(root), 0, atMost],
    ['duplicate metric productions', duplicateMetricProductions(root), 0, atMost],
    ['duplicate fixed test runs', duplicateFixedTestRuns(root), 0, atMost],
    ['import graph seal readers beyond one',
      importGraphSealReadersBeyondOne(root), 0, atMost],
    ['whole tree checks without input trigger',
      wholeTreeChecksWithoutInputTrigger(root), 0, atMost],
    ['eslint off pushed range', eslintOffPushedRange(root), 0, atMost],
    ['repository health not coalesced', repositoryHealthNotCoalesced(root), 0, atMost],
    ['workflows without concurrency', workflowsWithoutConcurrency(root), 0, atMost],
    ['ci resources not plan driven', ciResourcesNotPlanDriven(root), 0, atMost],
    ['canary after full corpus', canaryAfterFullCorpus(root), 0, atMost],
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

// --rows <name,name>: measure only the named rows (a quest probe over a
// subset of the table, so no quest needs a probe script of its own). A
// probe command is split on whitespace, so a row name is written with
// underscores for its spaces: open_legacy_epics.
// A name that matches no row is itself an unmet row: a misspelled probe
// must read red, never green by measuring nothing.
function selectedRows(rows, argv) {
  const index = arrayIndexOf(argv, ROWS_FLAG);
  if (index < 0) return rows;
  const names = arrayMap(
    stringSplit(String(argv[index + 1] || EMPTY_ROWS), ROW_SEPARATOR),
    (name) => stringReplaceAll(name, ROW_WORD_SEPARATOR, ROW_WORD_SPACE));
  return arrayMap(names, (name) =>
    arrayFind(rows, (row) => row.name === name) ||
    {name: `${UNKNOWN_ROW_PREFIX}${name}`, value: UNKNOWN_ROW_VALUE,
      budget: UNKNOWN_ROW_BUDGET, met: false});
}

function main(argv) {
  const rows = selectedRows(measureConsolidationBudget(), argv);
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

export {measureConsolidationBudget, selectedRows};
