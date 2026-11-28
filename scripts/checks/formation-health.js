/**
 * Formation health as a standing signal (`npm run health:formation`).
 *
 *   node scripts/checks/formation-health.js [--report <path>] [--gcp]
 *     [--summary] [--metric] [--fetch] [--trend <path>] [--limit <n>]
 *
 * Runs the MovieLens demo's formation-only phase (five local processes by
 * default, one node per GCP VM with --gcp) or reads an existing live report
 * with --report, then appends ONE compact trend record to the file named by
 * --trend (recording needs it; the nightly workflow names the checkout of
 * the data branch): when it ran, the git head, the scenario, the formation
 * verdict and reason, the seed's unexplained blocked time inside the
 * formation window, the formation window length, the ready-lease wait count
 * and the last observed critical spread gap.
 *
 * The record lives on the branch `data/formation-health`, file `trend.ndjson`,
 * never in the main tree. --summary and --metric read it from the LOCAL ref
 * refs/remotes/origin/data/formation-health and never fetch (a probe measures,
 * it never acts: rule R27); when that ref is absent the trend is `unavailable`,
 * which is not a measurement (--metric prints `unavailable` and fails).
 * --fetch is the explicit operator step: it fetches that one ref first.
 * --trend <file> reads (or records to) an explicit file instead.
 *
 * --summary prints the recent records as a table with the pass rate instead
 * of running anything. --metric prints how many of the last three records
 * fail to measure (the formation-health-verdicts probe: 0 once three
 * consecutive scheduled runs carry a verdict). An UNKNOWN verdict - the run
 * produced no measurement - is a failed run and is never appended: a
 * non-verdict in the trend would read as a data point. The verdict is derived
 * by examples/service-data-affinity/formation-verdict.js; this script only
 * records and renders it.
 */

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  FORMATION_VERDICT,
} from '../../examples/service-data-affinity/formation-verdict.js';
import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {
  NOT_CERTIFICATION_EVIDENCE,
} from '../../test/distributed/harness/certification-evidence-statement.js';
import {execGit, spawnGit} from './git-invocation.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringSplit = Function.call.bind(String.prototype.split);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..',
);
const REPORT_DIR = 'test-output/reports';
const LIVE_REPORT_PREFIX = 'movielens-lagrange-';
const REPORT_SUFFIX = '.report.json';
// The record's one home: a file on a data branch, read through the local
// remote-tracking ref. The nightly workflow pushes the branch; nothing
// commits the record to main.
const DATA_BRANCH = 'data/formation-health';
const DATA_BRANCH_FILE = 'trend.ndjson';
const DATA_BRANCH_REF = `refs/remotes/origin/${DATA_BRANCH}`;
const DATA_BRANCH_FETCH_ARGS = Object.freeze(
  ['fetch', '--quiet', 'origin', `+refs/heads/${DATA_BRANCH}:${DATA_BRANCH_REF}`]);
const DATA_BRANCH_EXISTS_ARGS = Object.freeze(['rev-parse', '--verify', '--quiet', DATA_BRANCH_REF]);
// Every call after the ref is resolved names the resolved sha, never the ref again.
const GIT_CAT_FILE = 'cat-file';
const GIT_TYPE_FLAG = '-t';
const GIT_LS_TREE = 'ls-tree';
const GIT_SHOW = 'show';
const dataBranchTypeArgs = (sha) => [GIT_CAT_FILE, GIT_TYPE_FLAG, sha];
const dataBranchListArgs = (sha) => [GIT_LS_TREE, sha, DATA_BRANCH_FILE];
const dataBranchShowArgs = (sha) => [GIT_SHOW, `${sha}:${DATA_BRANCH_FILE}`];
const GIT_EXIT_REF_ABSENT = 1;
const OBJECT_COMMIT = 'commit';
const REGULAR_FILE_ENTRY = /^100(?:644|755) blob /u;
const FETCH_SUBJECT = 'a network fetch';
const GIT_QUIET_STDIO = Object.freeze(['ignore', 'pipe', 'ignore']);
const TREND_AVAILABLE = 'available';
const TREND_UNAVAILABLE = 'unavailable';
const UNAVAILABLE_FETCH = `the fetch of ${DATA_BRANCH} failed`;
const UNAVAILABLE_REF = `${DATA_BRANCH_REF} is absent (run with --fetch)`;
const UNAVAILABLE_FILE = `${DATA_BRANCH_REF} holds no ${DATA_BRANCH_FILE}`;
const UNAVAILABLE_NOT_COMMIT = `${DATA_BRANCH_REF} is not a commit`;
const UNAVAILABLE_NOT_FILE = `${DATA_BRANCH_REF}:${DATA_BRANCH_FILE} is not a regular file`;
const UNAVAILABLE_NOT_NDJSON = `${DATA_BRANCH_FILE} is not ndjson (no line is JSON)`;
const UNAVAILABLE_NO_EXPLICIT_FILE = ' is not a readable file';
const LINE_NOT_JSON = 'is not JSON';
const LINE_NOT_CANONICAL = 'is not a record as the writer writes one';
const LINE_SCHEMA = 'has another schema version';
const LINE_UNANCHORED = 'names no time or head';
const LINE_NON_VERDICT = 'carries no measuring verdict';
const LINE_PARTIAL = 'is a partial line (no line end)';
const TREND_ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u;
const UNAVAILABLE_GIT = 'git could not read the repository: ';
const UNAVAILABLE_PREFIX = 'formation health: trend unavailable - ';
const RECORDING_NEEDS_TREND_MESSAGE = 'formation health: recording needs --trend <file> ' +
  `(the nightly workflow names its checkout of ${DATA_BRANCH}); nothing ran, nothing recorded`;
const DEMO_SCRIPT = 'examples/service-data-affinity/run-affinity-demo.js';
const FORMATION_ONLY_FLAG = '--formation-only';
const GCP_FLAG = '--gcp';
const THERMAL_GATE_SCRIPT = 'scripts/checks/wait-for-thermal-headroom.js';
const TEXT_ENCODING = 'utf8';
const ARGV_OFFSET = 2;
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const DEFAULT_SUMMARY_LIMIT = 20;
const GIT_HEAD_ARGS = Object.freeze(['rev-parse', '--short', 'HEAD']);
const HEAD_UNKNOWN = 'unknown';
const PERCENT = 100;
const RECORD_SCHEMA_VERSION = 1;
const NOT_OBSERVED = null;
const LINE_SEPARATOR = '\n';
const EMPTY_CELL = '-';
const CELL_SEPARATOR = ' ';
const STDIO_INHERIT = 'inherit';
const NO_REPORT_MESSAGE = 'formation health: no live report to record';
// A standing health signal (local processes or one node per GCP VM, no
// host-level placement requirement, no real publication-convergence
// observation): never certification evidence, and every rendering says so.
const NOT_CERTIFICATION_LINE =
  `formation health: ${NOT_CERTIFICATION_EVIDENCE.statement}`;
const UNKNOWN_VERDICT_MESSAGE = 'formation health: the run produced no ' +
  'measuring verdict (UNKNOWN) - nothing recorded; a non-verdict is a failed ' +
  'run, not a trend record';
const METRIC_WINDOW = 3;
const DEMO_REFUSAL_SUBJECT = 'the formation demo';
const TABLE_CELL = '|';
// --calibration <table>: formation-path owners the calibration table does
// not cover (formation-calibration-run probe); a missing table covers none.
const CALIBRATION_OWNERS = Object.freeze(arrayFilter(
  Object.values(FORMATION_OWNER), (owner) => owner !== FORMATION_OWNER.UNATTRIBUTED));
const THERMAL_REFUSED_MESSAGE =
  'formation health: thermal gate refused; nothing ran, nothing recorded';
const NO_NEW_REPORT_MESSAGE =
  'formation health: the run produced no new live report; nothing recorded';

const ARG = Object.freeze({
  REPORT: '--report',
  GCP: GCP_FLAG,
  SUMMARY: '--summary',
  TREND: '--trend',
  METRIC: '--metric',
  CALIBRATION: '--calibration',
  FETCH: '--fetch',
  LIMIT: '--limit',
});

const COLUMNS = Object.freeze([
  Object.freeze({key: 'at', width: 20}),
  Object.freeze({key: 'head', width: 9}),
  Object.freeze({key: 'verdict', width: 7}),
  Object.freeze({key: 'reason', width: 30}),
  Object.freeze({key: 'seedBlockedMs', width: 13}),
  Object.freeze({key: 'windowMs', width: 9}),
  Object.freeze({key: 'leaseWaits', width: 10}),
  Object.freeze({key: 'spreadGap', width: 9}),
]);

function parseArguments(argv) {
  const options = {
    report: null, gcp: false, summary: false, metric: false,
    calibration: null, fetch: false,
    trend: null, limit: DEFAULT_SUMMARY_LIMIT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === ARG.REPORT) {
      options.report = argv[index + 1] || null;
      index += 1;
    } else if (argument === ARG.TREND) {
      options.trend = argv[index + 1] || null;
      index += 1;
    } else if (argument === ARG.LIMIT) {
      const parsed = Number(argv[index + 1]);
      options.limit = Number.isFinite(parsed) && parsed > 0 ?
        parsed : DEFAULT_SUMMARY_LIMIT;
      index += 1;
    } else if (argument === ARG.GCP) {
      options.gcp = true;
    } else if (argument === ARG.SUMMARY) {
      options.summary = true;
    } else if (argument === ARG.METRIC) {
      options.metric = true;
    } else if (argument === ARG.CALIBRATION) {
      options.calibration = argv[index + 1] || null;
      index += 1;
    } else if (argument === ARG.FETCH) {
      options.fetch = true;
    }
  }
  return options;
}

function newestLiveReport(root) {
  const dir = path.join(root, REPORT_DIR);
  if (!fs.existsSync(dir)) return null;
  const names = arrayFilter(fs.readdirSync(dir), (name) =>
    stringStartsWith(name, LIVE_REPORT_PREFIX) &&
    stringEndsWith(name, REPORT_SUFFIX));
  const candidates = arrayMap(names, (name) =>
    ({name, mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs}))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  return candidates.length > 0 ?
    path.join(dir, candidates[candidates.length - 1].name) : null;
}

/**
 * Reduce one live report to a trend record. Pure.
 * @param {Object} report
 * @param {{at?: string, head?: string, reportPath?: string,
 *   run?: {id: string, attempt: string}}} [provenance]
 * @return {Object}
 */
function buildTrendRecord(report, provenance = {}) {
  const verdict = report?.formationVerdict || null;
  const scenarioEntry = report?.standardSummary?.scenarios?.[0] || null;
  return Object.freeze({
    schemaVersion: RECORD_SCHEMA_VERSION,
    at: provenance.at || report?.timestamp || new Date().toISOString(),
    head: provenance.head || HEAD_UNKNOWN,
    scenario: report?.scenario ?? NOT_OBSERVED,
    passed: scenarioEntry?.passed === true,
    verdict: verdict?.verdict ?? NOT_OBSERVED,
    reason: verdict?.reason ?? NOT_OBSERVED,
    seedStarved: verdict?.seedStarved ?? NOT_OBSERVED,
    seedBlockedMs: verdict?.seedGaps?.unexplainedMs ?? NOT_OBSERVED,
    seedMaxGapMs: verdict?.seedGaps?.maxGapMs ?? NOT_OBSERVED,
    windowMs: verdict?.window?.windowMs ?? NOT_OBSERVED,
    leaseWaits: verdict?.leaseWaits?.count ?? NOT_OBSERVED,
    spreadGap: verdict?.criticalSpread?.finalSpreadGap ?? NOT_OBSERVED,
    admissionState: verdict?.admission?.state ?? NOT_OBSERVED,
    reportPath: provenance.reportPath ?? NOT_OBSERVED,
    run: provenance.run ?? NOT_OBSERVED,
  });
}

function appendTrendRecord(trendPath, record) {
  fs.mkdirSync(path.dirname(trendPath), {recursive: true});
  // A torn tail is closed first, so a new record never glues onto it.
  const torn = fs.existsSync(trendPath) && fs.statSync(trendPath).size > 0 &&
    !stringEndsWith(fs.readFileSync(trendPath, TEXT_ENCODING), LINE_SEPARATOR);
  fs.appendFileSync(
    trendPath, `${torn ? LINE_SEPARATOR : ''}${JSON.stringify(record)}${LINE_SEPARATOR}`,
    TEXT_ENCODING,
  );
}

// A record measures when it carries a verdict: PASS or FAIL. UNKNOWN, an
// empty string or any other word is not a measurement.
function isMeasuringVerdict(verdict) {
  return verdict === FORMATION_VERDICT.PASS || verdict === FORMATION_VERDICT.FAIL;
}

// What is wrong with one trend line, or null for a whole record as the writer
// writes it: exactly the bytes JSON.stringify gives (so no duplicate key, no
// padding), schema 1, the writer's ISO time and a named head, and a measuring
// verdict. The one definition of a valid record: the reader owns validity.
function trendLineProblem(line) {
  let record = null;
  try {
    record = JSON.parse(line);
  } catch (_error) {
    return LINE_NOT_JSON;
  }
  const checks = [
    [record !== null && typeof record === 'object' && !Array.isArray(record) &&
      JSON.stringify(record) === line, LINE_NOT_CANONICAL],
    [record?.schemaVersion === RECORD_SCHEMA_VERSION, LINE_SCHEMA],
    [typeof record?.at === 'string' && TREND_ISO_TIME.test(record.at) &&
      Number.isFinite(Date.parse(record.at)) &&
      typeof record?.head === 'string' && record.head.length > 0, LINE_UNANCHORED],
    [isMeasuringVerdict(record?.verdict), LINE_NON_VERDICT],
  ];
  const failed = arrayFilter(checks, ([holds]) => !holds)[0];
  return failed ? failed[1] : null;
}

/**
 * The lines of a trend file, each a whole record or a problem, by line number.
 * A last line without its line end is a partial line even if it parses.
 * @param {string} text
 * @return {{number: number, record: Object|null, problem: string|null}[]}
 */
function parseTrend(text) {
  const pieces = stringSplit(text, LINE_SEPARATOR);
  const endsOnLine = stringEndsWith(text, LINE_SEPARATOR) || text.length === 0;
  if (endsOnLine) pieces.pop();
  return arrayMap(pieces, (line, index) => {
    const partial = !endsOnLine && index === pieces.length - 1;
    const problem = partial ? LINE_PARTIAL : trendLineProblem(line);
    return {number: index + 1, record: problem ? null : JSON.parse(line), problem};
  });
}

// A file with text in it and no JSON line at all is not ndjson.
const isNotNdjson = (lines) => lines.length > 0 &&
  arrayFilter(lines, (line) => line.problem !== LINE_NOT_JSON).length === 0;

function availableTrend(text) {
  const lines = parseTrend(text);
  return isNotNdjson(lines) ?
    {state: TREND_UNAVAILABLE, reason: UNAVAILABLE_NOT_NDJSON} :
    {state: TREND_AVAILABLE, lines};
}

// The whole records of a trend file; a missing file has none.
function readTrend(trendPath) {
  if (!fs.existsSync(trendPath)) return [];
  const lines = parseTrend(fs.readFileSync(trendPath, TEXT_ENCODING));
  return arrayMap(arrayFilter(lines, (line) => line.record), (line) => line.record);
}

// An explicit --trend file: missing, a directory or not ndjson is unavailable.
function readTrendFile(trendPath) {
  try {
    return availableTrend(fs.readFileSync(trendPath, TEXT_ENCODING));
  } catch (_error) {
    return {state: TREND_UNAVAILABLE, reason: `${trendPath}${UNAVAILABLE_NO_EXPLICIT_FILE}`};
  }
}

// Explicit operator step (--fetch): the one ref of the data branch, nothing else.
function fetchDataBranch(root) {
  refuseUnderProbe(FETCH_SUBJECT);
  try {
    execGit([...DATA_BRANCH_FETCH_ARGS], {cwd: root, stdio: GIT_QUIET_STDIO});
    return true;
  } catch (_error) {
    return false;
  }
}

// One read-only git question about the ref: its stdout, or null when it failed;
// `gitFailure` carries the failure that is not an absent ref.
function askGit(root, args) {
  return spawnGit([...args], {cwd: root, encoding: TEXT_ENCODING, stdio: GIT_QUIET_STDIO});
}

/**
 * The record on the data branch, read from the local remote-tracking ref
 * without any network call. A trend nobody could read is `unavailable`, never
 * an empty trend, with one reason: git could not run; the ref is absent; the
 * ref is not a commit; it holds no trend.ndjson; that entry is not a regular
 * file; the file is not ndjson. Otherwise the result carries every line with
 * its number: a line that is not a whole record is a problem line, not a
 * dropped one.
 * @param {string} root
 * @return {{state: string, lines?: Object[], reason?: string}}
 */
function readDataBranchTrend(root) {
  const unavailable = (reason) => ({state: TREND_UNAVAILABLE, reason});
  const exists = askGit(root, DATA_BRANCH_EXISTS_ARGS);
  if (exists.error || (exists.status !== GIT_EXIT_REF_ABSENT && exists.status !== EXIT_OK)) {
    return unavailable(`${UNAVAILABLE_GIT}${exists.error?.message ?? `exit ${exists.status}`}`);
  }
  if (exists.status === GIT_EXIT_REF_ABSENT) return unavailable(UNAVAILABLE_REF);
  const commit = stringTrim(exists.stdout);
  const type = askGit(root, dataBranchTypeArgs(commit));
  if (type.status !== EXIT_OK || stringTrim(type.stdout) !== OBJECT_COMMIT) {
    return unavailable(UNAVAILABLE_NOT_COMMIT);
  }
  const entry = stringTrim(askGit(root, dataBranchListArgs(commit)).stdout || '');
  if (!entry) return unavailable(UNAVAILABLE_FILE);
  if (!REGULAR_FILE_ENTRY.test(entry)) return unavailable(UNAVAILABLE_NOT_FILE);
  const shown = askGit(root, dataBranchShowArgs(commit));
  if (shown.status !== EXIT_OK) return unavailable(UNAVAILABLE_FILE);
  return {...availableTrend(shown.stdout), commit};
}

// An explicit --trend file, or the data branch (fetched only when asked).
function loadTrend({root, trend, fetch}) {
  if (trend) return readTrendFile(path.resolve(root, trend));
  const fetchFailed = fetch && !fetchDataBranch(root);
  return fetchFailed ? {state: TREND_UNAVAILABLE, reason: UNAVAILABLE_FETCH} :
    readDataBranchTrend(root);
}

function cell(value, width) {
  return stringPadEnd(String(value ?? EMPTY_CELL).slice(0, width), width);
}

/**
 * Render the recent trend as a table plus the pass rate. Pure.
 * @param {Object[]} records
 * @param {number} [limit]
 * @return {string}
 */
function renderTrendSummary(records, limit = DEFAULT_SUMMARY_LIMIT) {
  const recent = records.slice(-limit);
  const header = arrayMap(COLUMNS, (column) => cell(column.key, column.width))
    .join(CELL_SEPARATOR);
  const rows = arrayMap(recent, (record) =>
    arrayMap(COLUMNS, (column) => cell(record[column.key], column.width))
      .join(CELL_SEPARATOR));
  const passCount =
    arrayFilter(recent, (record) => record.passed === true).length;
  const starvedCount =
    arrayFilter(recent, (record) => record.seedStarved === true).length;
  const rate = recent.length > 0 ?
    Math.round((passCount / recent.length) * PERCENT) : 0;
  return [
    header, ...rows,
    `formation health: ${passCount}/${recent.length} passed (${rate}%), ` +
    `${starvedCount} with a starved seed`,
    NOT_CERTIFICATION_LINE,
  ].join(LINE_SEPARATOR);
}

function resolveHead(root) {
  try {
    return stringTrim(
      execGit(GIT_HEAD_ARGS, {cwd: root}).toString(TEXT_ENCODING),
    );
  } catch (_error) {
    return HEAD_UNKNOWN;
  }
}

// A record is written only for a report THIS run produced: a refused thermal
// gate or a killed demo never re-records the newest report already on disk.
function runFormationOnlyDemo(root, gcp, run) {
  refuseUnderProbe(DEMO_REFUSAL_SUBJECT);
  const before = newestLiveReport(root);
  const gate = run(process.execPath, [THERMAL_GATE_SCRIPT], {cwd: root});
  if (gate.status !== EXIT_OK) {
    return {reportPath: null, message: THERMAL_REFUSED_MESSAGE};
  }
  const args = [DEMO_SCRIPT, FORMATION_ONLY_FLAG];
  if (gcp) args.push(GCP_FLAG);
  run(process.execPath, args, {cwd: root});
  const after = newestLiveReport(root);
  if (!after || after === before) {
    return {reportPath: null, message: NO_NEW_REPORT_MESSAGE};
  }
  return {reportPath: after, message: null};
}

// Owners the calibration table does not carry as a row: a markdown table
// whose first cell is the owner name (`| bootstrap | ... |`), never a mention
// in prose.
function uncoveredCalibrationOwners(tablePath) {
  const table = fs.existsSync(tablePath) ? fs.readFileSync(tablePath, TEXT_ENCODING) : '';
  const rows = arrayMap(arrayFilter(stringSplit(table, LINE_SEPARATOR),
    (line) => stringStartsWith(stringTrim(line), TABLE_CELL)), (line) =>
    stringTrim(stringSplit(line, TABLE_CELL)[1] || ''));
  return arrayFilter(CALIBRATION_OWNERS, (owner) => !arrayIncludes(rows, owner));
}

// The workflow run that measured, so a record is traceable to its run and a
// late record can never pass for a new one.
function workflowRun(env) {
  return env.GITHUB_RUN_ID ?
    Object.freeze({id: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT ?? NOT_OBSERVED}) :
    NOT_OBSERVED;
}

// The last METRIC_WINDOW lines of the trend (missing lines count as absent).
const windowLines = (lines) => lines.slice(-METRIC_WINDOW);

/**
 * How many of the last METRIC_WINDOW LINES are whole measuring records; a line
 * that is not one (torn, glued, hand-made, another schema) is unmeasured, and
 * so is a line missing from a short trend.
 * @param {{record: Object|null}[]} lines
 * @return {number}
 */
function measuringInWindow(lines) {
  return arrayFilter(windowLines(lines), (line) => line.record !== null).length;
}

// The measurement names its input: the data-branch commit that was read.
const logSource = (log, loaded) => loaded.commit &&
  log(`formation health: read ${DATA_BRANCH} @ ${loaded.commit}`);

const problemLines = (lines) => arrayMap(arrayFilter(lines, (line) => line.problem),
  (line) => `formation health: line ${line.number} ${line.problem}`);

/**
 * Record one run (or an existing report) into the trend, or summarize it.
 * @param {Object} options parsed arguments plus injectable run/log
 * @return {{exitCode: number, record: Object|null}}
 */
function runFormationHealth({
  root = REPO_ROOT,
  report = null,
  gcp = false,
  summary = false,
  metric = false,
  calibration = null,
  fetch = false,
  trend = null,
  limit = DEFAULT_SUMMARY_LIMIT,
  env = process.env,
  run = (command, args, options) =>
    spawnSync(command, args, {...options, stdio: STDIO_INHERIT}),
  log = (line) => process.stdout.write(`${line}${LINE_SEPARATOR}`),
} = {}) {
  if (calibration) {
    const uncovered = uncoveredCalibrationOwners(path.resolve(root, calibration));
    log(String(uncovered.length));
    return {exitCode: uncovered.length === 0 ? EXIT_OK : EXIT_FAIL, record: null};
  }
  if (metric || summary) {
    const loaded = loadTrend({root, trend, fetch});
    if (loaded.state !== TREND_AVAILABLE) {
      log(metric ? TREND_UNAVAILABLE : UNAVAILABLE_PREFIX + loaded.reason);
      if (metric) log(UNAVAILABLE_PREFIX + loaded.reason);
      return {exitCode: EXIT_FAIL, record: null};
    }
    if (metric) {
      const unmeasured = METRIC_WINDOW - measuringInWindow(loaded.lines);
      logSource(log, loaded);
      for (const problem of problemLines(windowLines(loaded.lines))) log(problem);
      log(String(unmeasured));
      return {exitCode: unmeasured === 0 ? EXIT_OK : EXIT_FAIL, record: null};
    }
    logSource(log, loaded);
    for (const problem of problemLines(loaded.lines)) log(problem);
    log(renderTrendSummary(
      arrayMap(arrayFilter(loaded.lines, (line) => line.record), (line) => line.record), limit));
    return {exitCode: EXIT_OK, record: null};
  }
  if (!trend) {
    log(RECORDING_NEEDS_TREND_MESSAGE);
    return {exitCode: EXIT_FAIL, record: null};
  }
  const trendPath = path.resolve(root, trend);
  let reportPath = report ? path.resolve(root, report) : null;
  if (!reportPath) {
    const produced = runFormationOnlyDemo(root, gcp, run);
    if (produced.message) {
      log(produced.message);
      return {exitCode: EXIT_FAIL, record: null};
    }
    reportPath = produced.reportPath;
  }
  if (!reportPath || !fs.existsSync(reportPath)) {
    log(NO_REPORT_MESSAGE);
    return {exitCode: EXIT_FAIL, record: null};
  }
  const parsed = JSON.parse(fs.readFileSync(reportPath, TEXT_ENCODING));
  const record = buildTrendRecord(parsed, {
    head: resolveHead(root),
    reportPath: path.relative(root, reportPath),
    run: workflowRun(env),
  });
  if (!isMeasuringVerdict(record.verdict)) {
    log(UNKNOWN_VERDICT_MESSAGE);
    return {exitCode: EXIT_FAIL, record};
  }
  appendTrendRecord(trendPath, record);
  log(`formation health: recorded ${record.verdict} (${record.reason}) ` +
    `to ${path.relative(root, trendPath)}`);
  const written = parseTrend(fs.readFileSync(trendPath, TEXT_ENCODING));
  for (const problem of problemLines(written)) log(problem);
  log(renderTrendSummary(readTrend(trendPath), limit));
  return {exitCode: record.passed ? EXIT_OK : EXIT_FAIL, record};
}

// Both sides realpathed: Node realpaths import.meta.url but leaves argv[1] as
// typed, and a URL built from a path holding '#', '%' or '?' is not that
// path. A guard that missed would exit 0 having run nothing.
function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch (_error) {
    return false;
  }
}

if (isDirectInvocation()) {
  const argv = process.argv.slice(ARGV_OFFSET);
  process.exitCode = runFormationHealth(parseArguments(argv)).exitCode;
}

export {
  DATA_BRANCH,
  TREND_AVAILABLE,
  buildTrendRecord,
  METRIC_WINDOW,
  isMeasuringVerdict,
  measuringInWindow,
  parseArguments,
  readDataBranchTrend,
  readTrend,
  renderTrendSummary,
  runFormationHealth,
};
