/**
 * Acceptance budget for the solve-v2 epic (`node scripts/checks/solve-v2-budget.js`).
 *
 * Measures every acceptance metric of solve/epics/solve-v2.md against the
 * working tree and prints a before/after-ready table; exits non-zero when
 * any budget is exceeded. `--json` prints the measurements; `--phase-0`
 * only measures and never fails (the inventory phase records the baseline).
 *
 *   solve/ is accounted for in two semantic classes rather than one number:
 *   append-only quest history (the canonical logs, as classified by the
 *   quest-layout owner) and the active footprint that remains. Total, history
 *   and active bytes are each reported and the accounting is asserted to add
 *   up; only the active footprint carries the 20 MB budget, because history
 *   is an immutable record whose growth is normal and whose retention is a
 *   separate concern with its own owner. No tracked file > 1 MB under solve/,
 *   and the migrated corpus stays intact
 *   scripts/solve.js + scripts/solve/ <= 6000 lines; test/solve/ <= 6000
 *   docs/steering/ <= 3000 lines; always-load path <= 360 lines incl. AGENTS.md
 *   docs/steering/llm/rules.json absent; docs/steering/rules.md <= 25 rules
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ALLOWLIST as BINARY_GUARD_ALLOWLIST} from './check-solve-binary-guard.js';
import {verifyMigrationCorpus} from '../solve/migrate-v1.js';
import {isQuestLogPath} from '../solve/store.js';
import {closedQuestShapeOffences} from './check-closed-quest-shape.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const stringSplit = Function.call.bind(String.prototype.split);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringPadStart = Function.call.bind(String.prototype.padStart);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..',
);
const TEXT_ENCODING = 'utf8';
const ARGV_OFFSET = 2;
const JSON_FLAG = '--json';
const PHASE_ZERO_FLAG = '--phase-0';
// `--metric [<id,id,...>]` prints one number: how many of the named rows
// (every row when none is named) are over budget; the v2 script probe reads
// it, and the exit code is non-zero when any is.
const METRIC_FLAG = '--metric';
const METRIC_ID_SEPARATOR = ',';
const GIT_BINARY = 'git';
const GIT_LS_SOLVE = Object.freeze(['ls-files', '-z', 'solve']);
const NUL = '\0';
const LINE_SEPARATOR = '\n';
const DETAIL_SEPARATOR = ', ';
const DETAIL_LIMIT = 5;
const MEGABYTE = 1024 * 1024;
const MISSING_INVENTORY = 'no migration inventory: run migrate-v1 --inventory-from <commit>';
const ACTIVE_FOOTPRINT_BUDGET_BYTES = 20 * MEGABYTE;
// A row that is measured and printed but never fails: the number is there to
// be seen, not to gate.
const REPORTED_ONLY = '-';
const SOLVE_FILE_BUDGET_BYTES = MEGABYTE;
const SOLVER_LINE_BUDGET = 6000;
const SOLVER_TEST_LINE_BUDGET = 6000;
const STEERING_LINE_BUDGET = 3000;
const ALWAYS_LOAD_LINE_BUDGET = 360;
const RULES_BUDGET = 25;
const RULE_HEADING = /^(?:- |\d+\. |#{2,3} )/u;
const RULES_MD = 'docs/steering/rules.md';
const RULES_JSON = 'docs/steering/llm/rules.json';
const AGENTS_MD = 'AGENTS.md';
const ALWAYS_LOAD_CANDIDATES = Object.freeze([
  'docs/steering/llm/always.md',
  'docs/steering/llm/core.md',
  'docs/steering/llm/boot.md',
]);
const SOLVER_ENTRY = 'scripts/solve.js';
const SOLVER_DIR = 'scripts/solve';
const SOLVER_TEST_DIR = 'test/solve';
const STEERING_DIR = 'docs/steering';
const JS_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs']);
const TEXT_EXTENSIONS = Object.freeze(['.md', '.json', '.txt']);
const EXIT_OK = 0;
const EXIT_OVER_BUDGET = 1;
const JSON_INDENT = 2;
const CELL_WIDTH = 46;
const VALUE_WIDTH = 12;
const RULES_ABSENT = -1;
const HEADER_METRIC = 'metric';
const HEADER_VALUE = 'value';
const HEADER_BUDGET = 'budget';
const HEADER_VERDICT = '  verdict';
const VERDICT_OK = 'ok';
const VERDICT_OVER = 'OVER';
const CELL_GAP = '  ';

const METRIC = Object.freeze({
  SOLVE_TOTAL_BYTES: 'solve-total-bytes',
  SOLVE_HISTORY_BYTES: 'solve-history-bytes',
  SOLVE_ACTIVE_BYTES: 'solve-active-bytes',
  ACCOUNTING_RESIDUAL: 'solve-accounting-residual',
  LEGACY_CORPUS_DRIFT: 'legacy-corpus-drift',
  SOLVE_FILES_OVER_1MB: 'solve-files-over-1mb',
  QUEST_DIRS_OFF_SHAPE: 'quest-dirs-off-shape',
  SOLVER_LINES: 'solver-lines',
  SOLVER_TEST_LINES: 'solver-test-lines',
  STEERING_LINES: 'steering-lines',
  ALWAYS_LOAD_LINES: 'always-load-lines',
  RULES_JSON_ABSENT: 'rules-json-absent',
  RULES_MD_COUNT: 'rules-md-count',
});

function walk(dir, extensions) {
  const absolute = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(absolute)) return [];
  return arrayFlatMap(fs.readdirSync(absolute, {withFileTypes: true}), (entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(relative, extensions);
    return arraySome(extensions, (extension) =>
      stringEndsWith(entry.name, extension)) ? [relative] : [];
  });
}

// `wc -l` convention: the number of newline characters, so the table matches
// what an operator measures by hand.
function lineCount(relative) {
  const absolute = path.join(REPO_ROOT, relative);
  if (!fs.existsSync(absolute)) return 0;
  return stringSplit(fs.readFileSync(absolute, TEXT_ENCODING), LINE_SEPARATOR)
    .length - 1;
}

function linesOf(files) {
  return files.reduce((total, file) => total + lineCount(file), 0);
}

function trackedSolveFiles() {
  const out = execFileSync(GIT_BINARY, [...GIT_LS_SOLVE], {
    cwd: REPO_ROOT, encoding: TEXT_ENCODING,
  });
  return arrayFilter(stringSplit(out, NUL), Boolean);
}

function trackedBytes(tracked) {
  return tracked.reduce((total, file) => {
    const absolute = path.join(REPO_ROOT, file);
    return fs.existsSync(absolute) ? total + fs.statSync(absolute).size : total;
  }, 0);
}

// solve/ holds two semantic classes. Append-only quest history is an
// immutable record: `scripts/solve/store.js` owns which paths those are, so
// this check asks rather than restating the layout or subtracting a list of
// migrated files. Everything else is live solver state and carries the
// budget. A file placed under a quest directory is not history; only the
// canonical log is.
function classifySolveFootprint(tracked) {
  const history = arrayFilter(tracked, isQuestLogPath);
  const active = arrayFilter(tracked, (file) => !isQuestLogPath(file));
  return {
    total: trackedBytes(tracked),
    history: trackedBytes(history),
    active: trackedBytes(active),
    historyFiles: history.length,
  };
}

function rulesCount() {
  const absolute = path.join(REPO_ROOT, RULES_MD);
  if (!fs.existsSync(absolute)) return RULES_ABSENT;
  return arrayFilter(
    stringSplit(fs.readFileSync(absolute, TEXT_ENCODING), LINE_SEPARATOR),
    (line) => RULE_HEADING.test(line)).length;
}

function alwaysLoadLines() {
  return lineCount(AGENTS_MD) + linesOf(ALWAYS_LOAD_CANDIDATES);
}

// Amendment 4: a v2 quest directory holds exactly quest.json + log.ndjson,
// plus evidence/ while open. Before phase 2 every legacy quest file counts
// as off shape, which is the honest baseline.
// Quest-directory shape is owned by scripts/checks/check-closed-quest-shape.js:
// an open quest is working state, and a closed one holds its record, its log
// and exactly the proof its sealed claim requires. This row counts what that
// owner reports rather than restating the rule.
function questDirectoriesOffShape() {
  return closedQuestShapeOffences();
}

// The pre-commit guard's allowlist (one pre-v2 text log kept verbatim) is
// the single documented exception; both checks read the same list.
function oversizedSolveFiles(tracked) {
  return arrayFilter(tracked, (file) => {
    const absolute = path.join(REPO_ROOT, file);
    return !arrayIncludes(BINARY_GUARD_ALLOWLIST, file) &&
      fs.existsSync(absolute) &&
      fs.statSync(absolute).size > SOLVE_FILE_BUDGET_BYTES;
  });
}

// One row per acceptance metric: the measurement, its budget, and the
// comparison that decides it (strict or inclusive as the epic states).
const METRIC_ROWS = Object.freeze([
  // Reported, never gated: the honest size of solve/ on the record.
  Object.freeze({id: METRIC.SOLVE_TOTAL_BYTES, budget: REPORTED_ONLY,
    measure: (context) => context.footprint.total, ok: () => true,
    detail: (context) => [`${context.tracked.length} tracked files`]}),
  // Reported, never gated: an append-only record necessarily grows, and
  // retention or compaction is a separate concern with a separate owner.
  Object.freeze({id: METRIC.SOLVE_HISTORY_BYTES, budget: REPORTED_ONLY,
    measure: (context) => context.footprint.history, ok: () => true,
    detail: (context) => [`${context.footprint.historyFiles} canonical quest ` +
      'logs, classified by scripts/solve/store.js']}),
  Object.freeze({id: METRIC.SOLVE_ACTIVE_BYTES, budget: ACTIVE_FOOTPRINT_BUDGET_BYTES,
    measure: (context) => context.footprint.active,
    ok: (value) => value < ACTIVE_FOOTPRINT_BUDGET_BYTES}),
  // total = active + append-only history, proved rather than asserted.
  Object.freeze({id: METRIC.ACCOUNTING_RESIDUAL, budget: 0,
    measure: (context) => context.footprint.total -
      (context.footprint.active + context.footprint.history),
    ok: (value) => value === 0}),
  Object.freeze({id: METRIC.LEGACY_CORPUS_DRIFT, budget: 0,
    measure: (context) => context.corpus.present ? context.corpus.drift.length : 1,
    ok: (value) => value === 0,
    detail: (context) => context.corpus.present ?
      arrayMap(context.corpus.drift.slice(0, DETAIL_LIMIT),
        (entry) => `${entry.id}: ${entry.reason}`) :
      [MISSING_INVENTORY]}),
  Object.freeze({id: METRIC.SOLVE_FILES_OVER_1MB, budget: 0,
    measure: (context) => context.oversized.length, ok: (value) => value === 0,
    detail: (context) => context.oversized.slice(0, DETAIL_LIMIT)}),
  Object.freeze({id: METRIC.QUEST_DIRS_OFF_SHAPE, budget: 0,
    measure: () => questDirectoriesOffShape().length, ok: (value) => value === 0}),
  Object.freeze({id: METRIC.SOLVER_LINES, budget: SOLVER_LINE_BUDGET,
    measure: () => lineCount(SOLVER_ENTRY) + linesOf(walk(SOLVER_DIR, JS_EXTENSIONS)),
    ok: (value) => value <= SOLVER_LINE_BUDGET}),
  Object.freeze({id: METRIC.SOLVER_TEST_LINES, budget: SOLVER_TEST_LINE_BUDGET,
    measure: () => linesOf(walk(SOLVER_TEST_DIR, JS_EXTENSIONS)),
    ok: (value) => value <= SOLVER_TEST_LINE_BUDGET}),
  Object.freeze({id: METRIC.STEERING_LINES, budget: STEERING_LINE_BUDGET,
    measure: () => linesOf(walk(STEERING_DIR, TEXT_EXTENSIONS)),
    ok: (value) => value <= STEERING_LINE_BUDGET}),
  Object.freeze({id: METRIC.ALWAYS_LOAD_LINES, budget: ALWAYS_LOAD_LINE_BUDGET,
    measure: () => alwaysLoadLines(), ok: (value) => value <= ALWAYS_LOAD_LINE_BUDGET}),
  Object.freeze({id: METRIC.RULES_JSON_ABSENT, budget: 0,
    measure: () => (fs.existsSync(path.join(REPO_ROOT, RULES_JSON)) ? 1 : 0),
    ok: (value) => value === 0}),
  Object.freeze({id: METRIC.RULES_MD_COUNT, budget: RULES_BUDGET,
    measure: () => rulesCount(),
    ok: (value) => value > 0 && value <= RULES_BUDGET}),
]);

/**
 * Every acceptance measurement with its budget and verdict. Pure over the
 * working tree.
 * @return {Object[]}
 */
function measureSolveV2Budget() {
  const tracked = trackedSolveFiles();
  const context = {tracked, oversized: oversizedSolveFiles(tracked),
    footprint: classifySolveFootprint(tracked),
    corpus: verifyMigrationCorpus(REPO_ROOT)};
  return arrayMap(METRIC_ROWS, (row) => {
    const value = row.measure(context);
    return {
      id: row.id, value, budget: row.budget, ok: row.ok(value),
      detail: row.detail ? row.detail(context) : [],
    };
  });
}

function renderTable(rows) {
  const header = stringPadEnd(HEADER_METRIC, CELL_WIDTH) +
    stringPadStart(HEADER_VALUE, VALUE_WIDTH) +
    stringPadStart(HEADER_BUDGET, VALUE_WIDTH) + HEADER_VERDICT;
  const lines = arrayMap(rows, (row) =>
    stringPadEnd(row.id, CELL_WIDTH) +
    stringPadStart(String(row.value), VALUE_WIDTH) +
    stringPadStart(String(row.budget), VALUE_WIDTH) +
    CELL_GAP + (row.ok ? VERDICT_OK : VERDICT_OVER) +
    (row.detail.length > 0 ? CELL_GAP + row.detail.join(DETAIL_SEPARATOR) : ''));
  return [header, ...lines].join(LINE_SEPARATOR);
}

function metricMode(argv, rows) {
  const index = arrayIndexOf(argv, METRIC_FLAG);
  if (index === -1) return null;
  const ids = arrayFilter(stringSplit(String(argv[index + 1] || ''), METRIC_ID_SEPARATOR), Boolean);
  const selected = ids.length === 0 ? rows : arrayFilter(rows, (row) => arrayIncludes(ids, row.id));
  const over = arrayFilter(selected, (row) => !row.ok).length;
  process.stdout.write(`${over}${LINE_SEPARATOR}`);
  return over === 0 ? EXIT_OK : EXIT_OVER_BUDGET;
}

function main(argv) {
  const rows = measureSolveV2Budget();
  const metric = metricMode(argv, rows);
  if (metric !== null) return metric;
  if (arrayIncludes(argv, JSON_FLAG)) {
    process.stdout.write(JSON.stringify(rows, null, JSON_INDENT) + LINE_SEPARATOR);
  } else {
    process.stdout.write(renderTable(rows) + LINE_SEPARATOR);
  }
  const over = arrayFilter(rows, (row) => !row.ok).length;
  if (arrayIncludes(argv, PHASE_ZERO_FLAG)) return EXIT_OK;
  return over === 0 ? EXIT_OK : EXIT_OVER_BUDGET;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {
  ACTIVE_FOOTPRINT_BUDGET_BYTES, METRIC, measureSolveV2Budget, renderTable,
};
