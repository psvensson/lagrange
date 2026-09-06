// v2 probes: the only way a quest's or epic's doneWhen is measured. Each
// answers {metric, target, done, measuring, evidence, reason}; a probe that
// cannot measure says so (measuring: false) and is never done.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {CHECKS_DIR, PROBE} from './schema.js';

const TEXT_ENCODING = 'utf8';
const REPORT_DIR = 'test-output/reports';
const REPORT_SUFFIX = '.report.json';
const RECEIPT_SCHEMA = 'test-receipt/1';
const RECEIPT_PASS = 'pass';
const DEFAULT_CONSECUTIVE = 1;
const NON_MEASURING_SKIP_BUFFER = 6;
const METRIC_PRIORITY = 'priority';
const METRIC_FAILED = 'failed';
const SCRIPT_TIMEOUT_MS = 30 * 60 * 1000;
const SCRIPT_MAX_BUFFER = 16 * 1024 * 1024;
const NUMBER_LINE = /^-?\d+(?:\.\d+)?$/u;
// `command` may start with `node`; the script itself must live under
// scripts/checks and is always run with the current node binary.
const NODE_TOKEN = 'node';
const TARGET_ZERO = 0;
const NO_ARTIFACTS = Object.freeze([]);

// A live report whose harness, not the system under test, failed is a
// non-measuring sample: it counts neither for nor against a streak.
const NON_MEASURING_VERDICT_REASONS = Object.freeze([
  'execution_incomplete',
  'harness_connectivity',
  'host_scheduling_gap_budget_exceeded',
]);

const REASON = Object.freeze({
  RECEIPT_MISSING: 'receipt file missing or wrong schema',
  RECEIPT_EMPTY: 'receipt file carries no receipts',
  REQUIRED_MISSING: 'probe args name no required receipts',
  NO_REPORTS: 'no report for the scenario',
  ORACLE_MISSING: 'oracle file missing or malformed',
  SCRIPT_OUTSIDE_CHECKS: `script probes live under ${CHECKS_DIR}/`,
  SCRIPT_NO_METRIC: 'script printed no numeric metric line',
  UNSUPPORTED_METRIC: 'v1 metric kind not measured by v2 (re-express as a script probe): ',
  MEASURED: 'measured',
});

function notMeasuring(reason, evidence = null) {
  return {metric: null, target: TARGET_ZERO, done: false, measuring: false,
    evidence, reason};
}

function measured(metric, target, evidence, extra = {}) {
  return {metric, target, done: metric <= target, measuring: true, evidence,
    reason: REASON.MEASURED, ...extra};
}

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  } catch (_error) {
    return null;
  }
}

// --- test-receipt -----------------------------------------------------------

function measureTestReceipt(root, args) {
  const file = path.resolve(root, String(args.file || ''));
  const data = safeReadJson(file);
  if (!data || data.schema !== RECEIPT_SCHEMA) {
    return notMeasuring(REASON.RECEIPT_MISSING, args.file || null);
  }
  if (!Array.isArray(data.receipts) || data.receipts.length === 0) {
    return notMeasuring(REASON.RECEIPT_EMPTY, args.file);
  }
  const required = Array.isArray(args.requiredReceipts) ? args.requiredReceipts : [];
  if (required.length === 0) return notMeasuring(REASON.REQUIRED_MISSING, args.file);
  const byId = new Map(data.receipts.map((receipt) => [receipt.id, receipt]));
  const outstanding = required.filter((id) => byId.get(id)?.passed !== true);
  const overall = data.status === RECEIPT_PASS;
  return {
    ...measured(outstanding.length, TARGET_ZERO, args.file, {outstanding}),
    done: outstanding.length === 0 && overall,
  };
}

// --- scenario-harness -------------------------------------------------------

// v1 metric kinds that v2 does not measure: `sealed-bar` (stat-gate Wilson
// certification) and `distance` need a phase-4 re-expression as a script
// probe under a certification epic; until then they are honestly
// non-measuring rather than silently read as priority items.
const UNSUPPORTED_METRICS = Object.freeze(['sealed-bar', 'distance']);

function scenarioEntry(data, scenario) {
  const direct = Array.isArray(data?.scenarios) ? data.scenarios : [];
  const standard = Array.isArray(data?.standardSummary?.scenarios) ?
    data.standardSummary.scenarios : [];
  return [...direct, ...standard].find((entry) => entry?.scenario === scenario) || null;
}

function reportCoversScenario(data, scenario) {
  return scenarioEntry(data, scenario) !== null;
}

function verdictReasonOf(data, scenario) {
  return scenarioEntry(data, scenario)?.current?.verdictReason || null;
}

function isNonMeasuringRun(data, scenario) {
  return NON_MEASURING_VERDICT_REASONS.includes(verdictReasonOf(data, scenario));
}

function scenarioPassed(data, scenario) {
  const entry = scenarioEntry(data, scenario);
  if (typeof entry?.passed === 'boolean') return entry.passed;
  if (typeof entry?.current?.passed === 'boolean') return entry.current.passed;
  return data?.summary?.failed === 0;
}

function failedCount(data) {
  const failed = data?.summary?.failed;
  return Number.isInteger(failed) ? failed : null;
}

function readMetric(data, kind) {
  if (kind === METRIC_FAILED) return failedCount(data);
  const items = data?.optimizationSummary?.totalPriorityItems;
  return Number.isInteger(items) ? items : failedCount(data);
}

function metricKindOf(args) {
  return args.metric === METRIC_FAILED ? METRIC_FAILED : METRIC_PRIORITY;
}

/**
 * True when an already-written report is a non-measuring sample for the
 * scenario (shared with the live-report witness and the run repetitions).
 * @param {string} file
 * @param {{scenario: string, metric?: string}} [args]
 * @return {boolean}
 */
function reportSampleIsNonMeasuring(file, args = {}) {
  const data = safeReadJson(file);
  if (!data || !reportCoversScenario(data, args.scenario)) return false;
  return isNonMeasuringRun(data, args.scenario) ||
    readMetric(data, metricKindOf(args)) === null;
}

function safeMtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (_error) {
    return 0;
  }
}

// A report can only cover `scenario` if its quoted name appears in the raw
// text; check that before parsing gigabytes of gate playback.
function readCovering(file, scenario) {
  try {
    const raw = fs.readFileSync(file, TEXT_ENCODING);
    return raw.includes(`"${scenario}"`) ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

// Newest first: files by mtime, then covering reports by their own
// timestamp, one run per timestamp (ported from v1).
function listRuns(dir, scenario, limit) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith(REPORT_SUFFIX))
    .map((name) => path.join(dir, name))
    .map((file) => ({file, mtimeMs: safeMtimeMs(file)}))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const runs = [];
  const seen = new Set();
  for (const {file} of files) {
    if (runs.length >= limit) break;
    const data = readCovering(file, scenario);
    if (!data || !reportCoversScenario(data, scenario)) continue;
    const key = data.timestamp || file;
    if (seen.has(key)) continue;
    seen.add(key);
    runs.push({file, data});
  }
  return runs.sort((left, right) => String(right.data.timestamp || '')
    .localeCompare(String(left.data.timestamp || '')));
}

function measureScenarioHarness(root, args) {
  const scenario = String(args.scenario || '');
  if (UNSUPPORTED_METRICS.includes(args.metric)) {
    return notMeasuring(`${REASON.UNSUPPORTED_METRIC}${args.metric}`);
  }
  const consecutive = Number(args.consecutive) || DEFAULT_CONSECUTIVE;
  const kind = metricKindOf(args);
  const dir = path.resolve(root, String(args.reportDir || REPORT_DIR));
  const runs = listRuns(dir, scenario, consecutive + NON_MEASURING_SKIP_BUFFER);
  if (runs.length === 0) return notMeasuring(REASON.NO_REPORTS);
  const latest = runs[0];
  const measuring = runs.filter((run) =>
    !isNonMeasuringRun(run.data, scenario) && readMetric(run.data, kind) !== null);
  const recent = measuring.slice(0, consecutive);
  const streakDone = recent.length >= consecutive &&
    recent.every((run) => scenarioPassed(run.data, scenario));
  const evidence = path.relative(root, latest.file);
  const detail = {runs: runs.length, consecutive,
    passingStreak: recent.filter((run) => scenarioPassed(run.data, scenario)).length,
    verdictReason: verdictReasonOf(latest.data, scenario)};
  if (isNonMeasuringRun(latest.data, scenario) || readMetric(latest.data, kind) === null) {
    return {...notMeasuring(detail.verdictReason || REASON.NO_REPORTS, evidence),
      invalidSample: true, detail};
  }
  return {
    ...measured(readMetric(latest.data, kind), TARGET_ZERO, evidence, {detail}),
    done: streakDone,
    invalidSample: false,
  };
}

// v1-shaped probe object kept for the live-report witness tests.
const scenarioHarnessProbe = Object.freeze({
  name: PROBE.SCENARIO_HARNESS,
  measure: (args) => measureScenarioHarness(process.cwd(), args),
});

// --- oracle -----------------------------------------------------------------

function measureOracle(root, args) {
  const file = path.resolve(root, String(args.file || ''));
  const data = safeReadJson(file);
  if (!data || !Number.isFinite(Number(data.metric))) {
    return notMeasuring(REASON.ORACLE_MISSING, args.file || null);
  }
  const target = Number.isFinite(Number(data.target)) ? Number(data.target) : TARGET_ZERO;
  return measured(Number(data.metric), target, args.file);
}

// --- script -----------------------------------------------------------------

// A deterministic command under scripts/checks that prints one numeric
// metric on stdout; exit 0 with metric <= target is done.
function measureScript(root, args) {
  const command = String(args.command || '');
  const tokens = command.split(/\s+/u).filter(Boolean);
  if (tokens[0] === NODE_TOKEN) tokens.shift();
  const [script, ...rest] = tokens;
  const normalized = script ? path.normalize(script) : '';
  if (!normalized.startsWith(`${CHECKS_DIR}${path.sep}`) &&
    !normalized.startsWith(`${CHECKS_DIR}/`)) {
    return notMeasuring(REASON.SCRIPT_OUTSIDE_CHECKS, command);
  }
  const result = spawnSync(process.execPath, [script, ...rest], {
    cwd: root, encoding: TEXT_ENCODING, timeout: SCRIPT_TIMEOUT_MS,
    maxBuffer: SCRIPT_MAX_BUFFER,
  });
  const numbers = String(result.stdout || '').split('\n')
    .map((line) => line.trim()).filter((line) => NUMBER_LINE.test(line));
  if (numbers.length === 0) return notMeasuring(REASON.SCRIPT_NO_METRIC, command);
  const metric = Number(numbers[numbers.length - 1]);
  const target = Number.isFinite(Number(args.target)) ? Number(args.target) : TARGET_ZERO;
  return {
    ...measured(metric, target, command, {exitCode: result.status}),
    done: result.status === 0 && metric <= target,
  };
}

// Which repository paths a sealed doneWhen designates as proof artifacts.
// The probe owner answers this because it owns how each kind is measured: a
// consumer must never infer a requirement from a filename or from prose. A
// scenario-harness reads live reports and a script runs a checker, so neither
// designates an artifact the quest itself retains.
const PROBE_ARTIFACTS = Object.freeze({
  [PROBE.TEST_RECEIPT]: (args) => [args.file],
  [PROBE.ORACLE]: (args) => [args.file],
  [PROBE.SCENARIO_HARNESS]: () => NO_ARTIFACTS,
  [PROBE.SCRIPT]: () => NO_ARTIFACTS,
});

/**
 * The proof artifacts a sealed `doneWhen` requires, as repository-relative
 * paths. Empty for a probe that retains nothing.
 * @param {{probe: string, args: Object}} doneWhen
 * @return {string[]}
 */
function requiredProofArtifacts(doneWhen) {
  const artifacts = PROBE_ARTIFACTS[doneWhen?.probe];
  if (!artifacts) return NO_ARTIFACTS;
  return artifacts(doneWhen.args || {})
    .filter((file) => typeof file === 'string' && file.length > 0);
}

const PROBE_MEASURES = Object.freeze({
  [PROBE.TEST_RECEIPT]: measureTestReceipt,
  [PROBE.SCENARIO_HARNESS]: measureScenarioHarness,
  [PROBE.ORACLE]: measureOracle,
  [PROBE.SCRIPT]: measureScript,
});

/**
 * Measure a doneWhen. Unknown probes are non-measuring.
 * @param {string} root
 * @param {{probe: string, args: Object}} doneWhen
 * @return {Object}
 */
function measure(root, doneWhen) {
  const fn = PROBE_MEASURES[doneWhen?.probe];
  if (!fn) return notMeasuring(`unknown probe ${doneWhen?.probe}`);
  return fn(root, doneWhen.args || {});
}

export {
  NON_MEASURING_VERDICT_REASONS, REASON as PROBE_REASON, measure,
  reportSampleIsNonMeasuring, requiredProofArtifacts, scenarioHarnessProbe,
};
