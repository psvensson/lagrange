/**
 * Acceptance budget for the solve-v2 epic (`node scripts/checks/solve-v2-budget.js`).
 *
 * Measures every acceptance metric of solve/epics/solve-v2.md against the
 * working tree and prints a before/after-ready table; exits non-zero when
 * any budget is exceeded. `--json` prints the measurements; `--phase-0`
 * only measures and never fails (the inventory phase records the baseline).
 *
 *   solve/ on disk < 20 MB, no tracked file > 1 MB under solve/
 *   scripts/solve.js + scripts/solve/ <= 6000 lines; test/solve/ <= 6000
 *   docs/steering/ <= 3000 lines; always-load path <= 360 lines incl. AGENTS.md
 *   docs/steering/llm/rules.json absent; docs/steering/rules.md <= 25 rules
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
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
const GIT_BINARY = 'git';
const GIT_LS_SOLVE = Object.freeze(['ls-files', '-z', 'solve']);
const NUL = '\0';
const LINE_SEPARATOR = '\n';
const DETAIL_SEPARATOR = ', ';
const DETAIL_LIMIT = 5;
const MEGABYTE = 1024 * 1024;
const SOLVE_DIR = 'solve';
const SOLVE_DISK_BUDGET_BYTES = 20 * MEGABYTE;
const SOLVE_FILE_BUDGET_BYTES = MEGABYTE;
const QUESTS_DIR = 'solve/quests';
const QUEST_FILE = 'quest.json';
const QUEST_LOG = 'log.ndjson';
const QUEST_EVIDENCE_DIR = 'evidence';
const QUEST_ALLOWED_ENTRIES = Object.freeze([QUEST_FILE, QUEST_LOG, QUEST_EVIDENCE_DIR]);
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
  SOLVE_DISK_BYTES: 'solve-disk-bytes',
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

function diskBytes(dir) {
  const absolute = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(absolute)) return 0;
  return fs.readdirSync(absolute, {withFileTypes: true}).reduce((total, entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return total + diskBytes(relative);
    return total + fs.statSync(path.join(REPO_ROOT, relative)).size;
  }, 0);
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
function questDirectoriesOffShape() {
  const absolute = path.join(REPO_ROOT, QUESTS_DIR);
  if (!fs.existsSync(absolute)) return [];
  return arrayFilter(fs.readdirSync(absolute, {withFileTypes: true}), (entry) => {
    if (!entry.isDirectory()) return true;
    const names = fs.readdirSync(path.join(absolute, entry.name));
    return !arrayIncludes(names, QUEST_FILE) || !arrayIncludes(names, QUEST_LOG) ||
      arraySome(names, (name) => !arrayIncludes(QUEST_ALLOWED_ENTRIES, name));
  });
}

function oversizedSolveFiles(tracked) {
  return arrayFilter(tracked, (file) => {
    const absolute = path.join(REPO_ROOT, file);
    return fs.existsSync(absolute) &&
      fs.statSync(absolute).size > SOLVE_FILE_BUDGET_BYTES;
  });
}

// One row per acceptance metric: the measurement, its budget, and the
// comparison that decides it (strict or inclusive as the epic states).
const METRIC_ROWS = Object.freeze([
  Object.freeze({id: METRIC.SOLVE_DISK_BYTES, budget: SOLVE_DISK_BUDGET_BYTES,
    measure: () => diskBytes(SOLVE_DIR), ok: (value) => value < SOLVE_DISK_BUDGET_BYTES}),
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
  const context = {tracked, oversized: oversizedSolveFiles(tracked)};
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

function main(argv) {
  const rows = measureSolveV2Budget();
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

export {METRIC, measureSolveV2Budget, renderTable};
