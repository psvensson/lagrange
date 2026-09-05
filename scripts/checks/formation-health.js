/**
 * Formation health as a standing signal (`npm run health:formation`).
 *
 *   node scripts/checks/formation-health.js [--report <path>] [--gcp]
 *     [--summary] [--trend <path>] [--limit <n>]
 *
 * Runs the MovieLens demo's formation-only phase (five local processes by
 * default, one node per GCP VM with --gcp) or reads an existing live report
 * with --report, then appends ONE compact trend record to
 * data/formation-health/trend.ndjson: when it ran, the git head, the
 * scenario, the formation verdict and reason, the seed's unexplained blocked
 * time inside the formation window, the formation window length, the
 * ready-lease wait count and the last observed critical spread gap.
 * --summary prints the recent records as a table with the pass rate instead
 * of running anything. The verdict is derived by
 * examples/service-data-affinity/formation-verdict.js; this script only
 * records and renders it.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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
const THERMAL_REFUSED_MESSAGE =
  'formation health: thermal gate refused; nothing ran, nothing recorded';
const NO_NEW_REPORT_MESSAGE =
  'formation health: the run produced no new live report; nothing recorded';

const ARG = Object.freeze({
  REPORT: '--report',
  GCP: GCP_FLAG,
  SUMMARY: '--summary',
  TREND: '--trend',
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
    report: null, gcp: false, summary: false,
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
 * @param {{at?: string, head?: string, reportPath?: string}} [provenance]
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
  trend = DEFAULT_TREND_PATH,
  limit = DEFAULT_SUMMARY_LIMIT,
  run = (command, args, options) =>
    spawnSync(command, args, {...options, stdio: STDIO_INHERIT}),
  log = (line) => process.stdout.write(`${line}${LINE_SEPARATOR}`),
} = {}) {
  const trendPath = path.resolve(root, trend);
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
  });
  appendTrendRecord(trendPath, record);
  log(`formation health: recorded ${record.verdict} (${record.reason}) ` +
    `to ${path.relative(root, trendPath)}`);
  log(renderTrendSummary(readTrend(trendPath), limit));
  return {exitCode: record.passed ? EXIT_OK : EXIT_FAIL, record};
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode =
    runFormationHealth(parseArguments(process.argv.slice(ARGV_OFFSET)))
      .exitCode;
}

export {
  DEFAULT_TREND_PATH,
  buildTrendRecord,
  parseArguments,
  readTrend,
  renderTrendSummary,
  runFormationHealth,
};
