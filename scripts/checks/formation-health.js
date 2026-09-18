/**
 * Formation health as a standing signal (`npm run health:formation`).
 *
 *   node scripts/checks/formation-health.js [--report <path>] [--gcp]
 *     [--summary] [--metric] [--trend <path>] [--limit <n>]
 *
 * Runs the MovieLens demo's formation-only phase (five local processes by
 * default, one node per GCP VM with --gcp) or reads an existing live report
 * with --report, then appends ONE compact trend record to
 * data/formation-health/trend.ndjson: when it ran, the git head, the
 * scenario, the formation verdict and reason, the seed's unexplained blocked
 * time inside the formation window, the formation window length, the
 * ready-lease wait count and the last observed critical spread gap.
 * --summary prints the recent records as a table with the pass rate instead
 * of running anything. --metric prints how many of the last three records
 * fail to measure (the formation-health-verdicts probe: 0 once three
 * consecutive scheduled runs carry a verdict). An UNKNOWN verdict - the run
 * produced no measurement - is a failed run and is never appended: a
 * non-verdict in the trend would read as a data point. The verdict is derived
 * by examples/service-data-affinity/formation-verdict.js; this script only
 * records and renders it.
 *
 *   node scripts/checks/formation-health.js --verify-trend-push <base> <head>
 *
 * proves that base..head only appends measuring records to the trend: the
 * one predicate that admits the nightly workflow's data-only push to main.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  FORMATION_VERDICT,
} from '../../examples/service-data-affinity/formation-verdict.js';
import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
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
const DEFAULT_TREND_PATH = 'data/formation-health/trend.ndjson';
const DEMO_SCRIPT = 'examples/service-data-affinity/run-affinity-demo.js';
const FORMATION_ONLY_FLAG = '--formation-only';
const GCP_FLAG = '--gcp';
const THERMAL_GATE_SCRIPT = 'scripts/checks/wait-for-thermal-headroom.js';
const TEXT_ENCODING = 'utf8';
const ARGV_OFFSET = 2;
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const DEFAULT_SUMMARY_LIMIT = 20;
const GIT_BINARY = 'git';
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
// --bot-commits: commits by the nightly workflow may touch only the trend.
const BOT_AUTHOR = 'formation-health';
const GIT_LOG_ARGS = Object.freeze(['log', `--author=${BOT_AUTHOR}`, '--format=%H', 'HEAD']);
const GIT_DIFF_TREE_ARGS = Object.freeze(['diff-tree', '--no-commit-id', '--name-only', '-r']);
// The data-only push of the nightly trend record. The pre-push hook asks this
// predicate when a push requests LAGRANGE_PUSH_DATA_ONLY=formation-trend, and
// refuses the push on any problem - it never falls back to the code gate, so
// the request cannot carry code. The nightly's push used to take the whole
// gate on the provisioning runner and was lost for four nights (2026-09-15 to
// 09-18): three to a red main, one to a seal the gate rewrote after the
// workflow re-resolved the dependency tree away from the lockfile.
const TREND_PUSH_FLAG = '--verify-trend-push';
const TREND_PUSH_FILE_MODE = '100644';
const TREND_PUSH_MODIFIED = 'M';
const TREND_PUSH_RAW_PREFIX = ':';
const TREND_PUSH_FIELD_SEPARATOR = ' ';
const TREND_PUSH_PATH_SEPARATOR = '\t';
const TREND_PUSH_SHA = /^[0-9a-f]{40}$/u;
const TREND_PUSH_NO_SHA = '0000000000000000000000000000000000000000';
const TREND_PUSH_NEWLINE_BYTE = 0x0a;
// The time a writer stamps (Date.prototype.toISOString): nothing looser.
const TREND_PUSH_ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u;
// A whole trend file, read through one git call, fits well inside this.
const TREND_PUSH_MAX_BLOB_BYTES = 64 * 1024 * 1024;
// Git answers for the objects the push carries: no replace refs substitute
// another commit, and a gitlink is a change however .gitmodules says to
// ignore it.
const TREND_PUSH_GIT_ENV = Object.freeze({GIT_NO_REPLACE_OBJECTS: '1'});
const trendPushGit = Object.freeze({
  commit: (sha) => ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`],
  ancestor: (base, head) => ['merge-base', '--is-ancestor', base, head],
  commits: (base, head) => ['rev-list', '--reverse', '--parents', `${base}..${head}`],
  changes: (parent, sha) => ['diff-tree', '--no-commit-id', '-r', '--raw', '--no-abbrev',
    '--no-renames', '--ignore-submodules=none', parent, sha],
  blob: (sha) => ['cat-file', 'blob', sha],
});
// git's output is read; its diagnostics are not the predicate's evidence.
const TREND_PUSH_GIT_STDIO = Object.freeze(['ignore', 'pipe', 'ignore']);
const TREND_PUSH_PROBLEM = Object.freeze({
  NOT_A_COMMIT: 'not a commit: ',
  NOT_FAST_FORWARD: 'the pushed head does not descend from the remote main',
  NO_COMMITS: 'the push carries no commit',
  MERGE: 'not exactly one parent: ',
  OTHER_CHANGES: 'changes more than the trend file in place: ',
  NOT_APPEND: 'rewrites the trend instead of appending to it: ',
  TORN_TAIL: 'leaves a partial line: ',
  UNREADABLE: 'an appended line is not a record as the writer writes one: ',
  SCHEMA: 'an appended record has another schema version: ',
  UNANCHORED: 'an appended record names no time or head: ',
  NON_VERDICT: 'an appended record carries no measuring verdict: ',
  GIT: 'git: ',
});
const TREND_PUSH_VERIFIED = 'formation health: trend push verified - ';
const TREND_PUSH_REFUSED = 'formation health: trend push refused - ';
const trendPushCounts = (records, commits) =>
  `${records} appended record(s) in ${commits} commit(s)`;
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
  BOT_COMMITS: '--bot-commits',
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
    calibration: null, botCommits: false,
    trend: DEFAULT_TREND_PATH, limit: DEFAULT_SUMMARY_LIMIT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === ARG.REPORT) {
      options.report = argv[index + 1] || null;
      index += 1;
    } else if (argument === ARG.TREND) {
      options.trend = argv[index + 1] || DEFAULT_TREND_PATH;
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
    } else if (argument === ARG.BOT_COMMITS) {
      options.botCommits = true;
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
  fs.appendFileSync(
    trendPath, `${JSON.stringify(record)}${LINE_SEPARATOR}`, TEXT_ENCODING,
  );
}

function readTrend(trendPath) {
  if (!fs.existsSync(trendPath)) return [];
  const records = [];
  const text = fs.readFileSync(trendPath, TEXT_ENCODING);
  for (const line of stringSplit(text, LINE_SEPARATOR)) {
    if (!stringTrim(line)) continue;
    try {
      records.push(JSON.parse(line));
    } catch (_error) {
      // A torn trailing line from an interrupted append is not a record.
    }
  }
  return records;
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
  ].join(LINE_SEPARATOR);
}

function resolveHead(root) {
  try {
    return stringTrim(
      execFileSync(GIT_BINARY, GIT_HEAD_ARGS, {cwd: root}).toString(TEXT_ENCODING),
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

// Commits by the nightly author that touch anything but the trend file: the
// workflow token commits one inert data file and nothing else.
function botCommitsOutsideTrend(root, trend) {
  const shas = arrayFilter(stringSplit(execFileSync(GIT_BINARY, [...GIT_LOG_ARGS],
    {cwd: root, encoding: TEXT_ENCODING}), LINE_SEPARATOR), (line) => line.length > 0);
  const offending = [];
  for (let index = 0; index < shas.length; index += 1) {
    const paths = arrayFilter(stringSplit(execFileSync(GIT_BINARY,
      [...GIT_DIFF_TREE_ARGS, shas[index]], {cwd: root, encoding: TEXT_ENCODING}),
    LINE_SEPARATOR), (line) => line.length > 0);
    if (arrayFilter(paths, (candidate) => candidate !== trend).length > 0) {
      offending.push(`${shas[index]} touches ${paths.join(CELL_SEPARATOR)}`);
    }
  }
  return offending;
}

// The workflow run that measured, so a record is traceable to its run and a
// late record can never pass for a new one.
function workflowRun(env) {
  return env.GITHUB_RUN_ID ?
    Object.freeze({id: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT ?? NOT_OBSERVED}) :
    NOT_OBSERVED;
}

function gitOutput(root, args, encoding = TEXT_ENCODING) {
  return execFileSync(GIT_BINARY, args, {cwd: root, encoding, stdio: TREND_PUSH_GIT_STDIO,
    env: {...process.env, ...TREND_PUSH_GIT_ENV}, maxBuffer: TREND_PUSH_MAX_BLOB_BYTES});
}

// The first problem one appended line has, or null for a whole measuring
// record.
function appendedRecordProblem(line) {
  let record = null;
  try {
    record = JSON.parse(line);
  } catch (_error) {
    return TREND_PUSH_PROBLEM.UNREADABLE + line;
  }
  // Canonical: exactly the bytes JSON.stringify writes for this object, so a
  // duplicate key, a padded verdict or stray whitespace is not a record.
  const checks = [
    [record !== null && typeof record === 'object' && !Array.isArray(record) &&
      JSON.stringify(record) === line, TREND_PUSH_PROBLEM.UNREADABLE],
    [record?.schemaVersion === RECORD_SCHEMA_VERSION, TREND_PUSH_PROBLEM.SCHEMA],
    [typeof record?.at === 'string' && TREND_PUSH_ISO_TIME.test(record.at) &&
      Number.isFinite(Date.parse(record.at)) &&
      typeof record?.head === 'string' && record.head.length > 0, TREND_PUSH_PROBLEM.UNANCHORED],
    [isMeasuringVerdict(record?.verdict), TREND_PUSH_PROBLEM.NON_VERDICT],
  ];
  const failed = arrayFilter(checks, ([holds]) => !holds)[0];
  return failed ? failed[1] + line : null;
}

// What one commit appended to the trend, or the problem with it: the old
// bytes are a prefix of the new, both end on a line boundary, and every
// appended line is a whole measuring record.
function appendedRecords(before, after, sha) {
  const prefix = after.subarray(0, before.length);
  const endsOnLine = (bytes) => bytes.length === 0 ||
    bytes[bytes.length - 1] === TREND_PUSH_NEWLINE_BYTE;
  if (after.length <= before.length || Buffer.compare(prefix, before) !== 0) {
    return {problems: [TREND_PUSH_PROBLEM.NOT_APPEND + sha], count: 0};
  }
  if (!endsOnLine(before) || !endsOnLine(after)) {
    return {problems: [TREND_PUSH_PROBLEM.TORN_TAIL + sha], count: 0};
  }
  // Ends on a line boundary, so the last split piece is the empty tail; every
  // other piece - a blank line included - must be a record.
  const lines = stringSplit(after.subarray(before.length).toString(TEXT_ENCODING),
    LINE_SEPARATOR).slice(0, -1);
  const problems = arrayFilter(arrayMap(lines, appendedRecordProblem), Boolean);
  return {problems, count: lines.length};
}

// One commit of the push: one parent, and exactly the trend file modified in
// place with its mode kept.
function trendCommitProblems(root, trend, parents) {
  const [sha, ...parent] = parents;
  if (parent.length !== 1) return {problems: [TREND_PUSH_PROBLEM.MERGE + sha], count: 0};
  const changes = arrayFilter(stringSplit(gitOutput(root, trendPushGit.changes(parent[0], sha)),
    LINE_SEPARATOR), (line) => line.length > 0);
  const [meta, file] = stringSplit(changes[0] || '', TREND_PUSH_PATH_SEPARATOR);
  const [oldMode, newMode, oldBlob, newBlob, status] =
    stringSplit(meta.slice(TREND_PUSH_RAW_PREFIX.length), TREND_PUSH_FIELD_SEPARATOR);
  const inPlace = changes.length === 1 && file === trend && status === TREND_PUSH_MODIFIED &&
    oldMode === TREND_PUSH_FILE_MODE && newMode === TREND_PUSH_FILE_MODE;
  if (!inPlace) return {problems: [TREND_PUSH_PROBLEM.OTHER_CHANGES + sha], count: 0};
  return appendedRecords(gitOutput(root, trendPushGit.blob(oldBlob), null),
    gitOutput(root, trendPushGit.blob(newBlob), null), sha);
}

// Whether a git command exits 0; its output is not needed.
function succeeds(root, args) {
  try {
    gitOutput(root, args);
    return true;
  } catch (_error) {
    return false;
  }
}

function isCommit(root, sha) {
  return TREND_PUSH_SHA.test(sha) && sha !== TREND_PUSH_NO_SHA &&
    succeeds(root, trendPushGit.commit(sha));
}

// The commits base..head, each as [sha, ...parents], or the problem that
// makes the range ineligible before any commit is read.
function trendPushRange(root, base, head) {
  const unknown = arrayFilter([base, head], (sha) => !isCommit(root, sha))[0];
  const descends = unknown === undefined && succeeds(root, trendPushGit.ancestor(base, head));
  const problem = unknown === undefined ?
    (descends ? null : TREND_PUSH_PROBLEM.NOT_FAST_FORWARD) :
    TREND_PUSH_PROBLEM.NOT_A_COMMIT + unknown;
  if (problem) return {problem, commits: []};
  const lines = arrayFilter(stringSplit(gitOutput(root, trendPushGit.commits(base, head)),
    LINE_SEPARATOR), (line) => line.length > 0);
  const commits = arrayMap(lines, (line) => stringSplit(line, TREND_PUSH_FIELD_SEPARATOR));
  return {problem: commits.length === 0 ? TREND_PUSH_PROBLEM.NO_COMMITS : null, commits};
}

/**
 * Whether base..head only appends measuring records to the trend file. Any
 * problem - including a git error - makes the push ineligible.
 * @param {string} root
 * @param {string} base the remote main the push fast-forwards
 * @param {string} head the pushed commit
 * @param {string} [trend]
 * @return {{problems: string[], records: number, commits: number}}
 */
function verifyTrendPush(root, base, head, trend = DEFAULT_TREND_PATH) {
  try {
    const range = trendPushRange(root, base, head);
    if (range.problem) return {problems: [range.problem], records: 0, commits: 0};
    const problems = [];
    let records = 0;
    for (const parents of range.commits) {
      const commit = trendCommitProblems(root, trend, parents);
      problems.push(...commit.problems);
      records += commit.count;
    }
    return {problems, records, commits: range.commits.length};
  } catch (error) {
    return {problems: [TREND_PUSH_PROBLEM.GIT + error.message], records: 0, commits: 0};
  }
}

// `--verify-trend-push <base> <head>`, or null when not asked.
function parseTrendPushArguments(argv) {
  const index = arrayIndexOf(argv, TREND_PUSH_FLAG);
  return index < 0 ? null : {base: argv[index + 1] || '', head: argv[index + 2] || ''};
}

function runTrendPushVerification({root = REPO_ROOT, base, head,
  log = (line) => process.stdout.write(`${line}${LINE_SEPARATOR}`)}) {
  const verified = verifyTrendPush(root, base, head);
  for (const problem of verified.problems) log(TREND_PUSH_REFUSED + problem);
  if (verified.problems.length > 0) return EXIT_FAIL;
  log(TREND_PUSH_VERIFIED + trendPushCounts(verified.records, verified.commits));
  return EXIT_OK;
}

// A record measures when it carries a verdict: PASS or FAIL. UNKNOWN, an
// empty string or any other word is not a measurement.
function isMeasuringVerdict(verdict) {
  return verdict === FORMATION_VERDICT.PASS || verdict === FORMATION_VERDICT.FAIL;
}

// How many of the last METRIC_WINDOW records fail to measure; missing
// records count as unmeasured, so an empty trend reads METRIC_WINDOW.
function unmeasuredInWindow(records) {
  const window = records.slice(-METRIC_WINDOW);
  const measuring = arrayFilter(window,
    (record) => isMeasuringVerdict(record.verdict)).length;
  return METRIC_WINDOW - measuring;
}

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
  botCommits = false,
  trend = DEFAULT_TREND_PATH,
  limit = DEFAULT_SUMMARY_LIMIT,
  env = process.env,
  run = (command, args, options) =>
    spawnSync(command, args, {...options, stdio: STDIO_INHERIT}),
  log = (line) => process.stdout.write(`${line}${LINE_SEPARATOR}`),
} = {}) {
  const trendPath = path.resolve(root, trend);
  if (calibration) {
    const uncovered = uncoveredCalibrationOwners(path.resolve(root, calibration));
    log(String(uncovered.length));
    return {exitCode: uncovered.length === 0 ? EXIT_OK : EXIT_FAIL, record: null};
  }
  if (botCommits) {
    const offending = botCommitsOutsideTrend(root, trend);
    for (let index = 0; index < offending.length; index += 1) log(offending[index]);
    log(String(offending.length));
    return {exitCode: offending.length === 0 ? EXIT_OK : EXIT_FAIL, record: null};
  }
  if (metric) {
    const unmeasured = unmeasuredInWindow(readTrend(trendPath));
    log(String(unmeasured));
    return {exitCode: unmeasured === 0 ? EXIT_OK : EXIT_FAIL, record: null};
  }
  if (summary) {
    log(renderTrendSummary(readTrend(trendPath), limit));
    return {exitCode: EXIT_OK, record: null};
  }
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
  log(renderTrendSummary(readTrend(trendPath), limit));
  return {exitCode: record.passed ? EXIT_OK : EXIT_FAIL, record};
}

// Both sides realpathed: Node realpaths import.meta.url but leaves argv[1] as
// typed, and a URL built from a path holding '#', '%' or '?' is not that
// path. A guard that missed would exit 0 having run nothing - and the
// pre-push hook admits a data-only push on this command (verifier,
// formation-health-verdicts round 1).
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
  const trendPush = parseTrendPushArguments(argv);
  process.exitCode = trendPush ? runTrendPushVerification(trendPush) :
    runFormationHealth(parseArguments(argv)).exitCode;
}

export {
  DEFAULT_TREND_PATH,
  buildTrendRecord,
  isMeasuringVerdict,
  parseArguments,
  readTrend,
  renderTrendSummary,
  runFormationHealth,
  verifyTrendPush,
};
