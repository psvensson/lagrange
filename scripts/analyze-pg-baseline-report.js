#!/usr/bin/env node

import {readdir, readFile, stat} from 'node:fs/promises';
import {resolve, join} from 'node:path';

const LOCAL_NUM_ONE = 1;
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_N_A = 'n/a';
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_PERCENT = '%';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_DIAGNOSIS = 'Diagnosis';
const LOCAL_STR_1E0TM = 'Run failed before benchmark load. Primary issue was seed bootstrap ';
const LOCAL_STR_341CN = 'readiness timeout, not load-stage request handling.';
const LOCAL_STR_1AMGS = 'No load metrics were recorded for this scenario.';
const LOCAL_STR_MM91M = 'Most load-side failures were likely fast circuit-breaker rejections ';
const LOCAL_STR_ESTIMATED = '(estimated ';
const LOCAL_STR_AFTER_A_SMALLER = ') after a smaller ';
const LOCAL_STR_I51O0 = 'set of actual load-channel exceptions (';
const LOCAL_STR_IE9I6 = ').';
const LOCAL_STR_QS0EQ = 'Participant-failure envelopes were observed. These are distributed ';
const LOCAL_STR_YZ1SY = 'query-level failures and should be correlated with partition-level diagnostics.';
const LOCAL_STR_139VE = 'Timeouts appear without circuit-open dominance; investigate slow query ';
const LOCAL_STR_1N0CZ = 'path or load timeout budget.';
const LOCAL_STR_17VIJ = 'No load errors were reported.';
const LOCAL_STR_REPORT = 'Report';
const LOCAL_STR_PATH = 'path: ';
const LOCAL_STR_TIMESTAMP = 'timestamp: ';
const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_STR_SUMMARY_PASSED = 'summary: passed=';
const LOCAL_STR_SLASH = '/';
const LOCAL_STR_FAILED = ', failed=';
const LOCAL_STR_SCENARIO = 'scenario: ';
const LOCAL_STR_SCENARIOPASSED = 'scenarioPassed: ';
const LOCAL_STR_SCENARIOERROR = 'scenarioError: ';
const LOCAL_STR_LOAD = 'Load';
const LOCAL_STR_LOADMETRICS_NONE = 'loadMetrics: none';
const LOCAL_STR_OPERATIONS_TOTAL = 'operations: total=';
const LOCAL_STR_SUCCESS = ', success=';
const LOCAL_STR_ERRORS = ', errors=';
const LOCAL_STR_ATTEMPTERRORS = ', attemptErrors=';
const LOCAL_STR_RATES_SUCCESS = 'rates: success=';
const LOCAL_STR_OPSPERSEC = 'opsPerSec: ';
const LOCAL_STR_LATENCYMS_P50 = 'latencyMs: p50=';
const LOCAL_STR_P95 = ', p95=';
const LOCAL_STR_P99 = ', p99=';
const LOCAL_STR_TGPWE = 'loadChannel: requests=';
const LOCAL_STR_SUCCESSES = ', successes=';
const LOCAL_STR_TIMEOUTS = ', timeouts=';
const LOCAL_STR_BREAKEROPENS = ', breakerOpens=';
const LOCAL_STR_LOADCHANNEL_NONE = 'loadChannel: none';
const LOCAL_STR_DISTINCTERRORS = 'distinctErrors (';
const LOCAL_STR_626BD = '):';
const LOCAL_STR_9XLXH = '- ';
const LOCAL_STR_5523F = 'distinctErrors: none';
const LOCAL_STR_DERIVED = 'Derived';
const LOCAL_STR_ATTEMPTERRORS_2 = 'attemptErrors=';
const LOCAL_STR_19FSR = ', loadChannelExceptions=';
const LOCAL_STR_LOADTIMEOUTS = ', loadTimeouts=';
const LOCAL_STR_WH87L = ', estimatedFastRejects=';
const LOCAL_STR_OPERATIONFAILURES = ', operationFailures=';
const LOCAL_STR_6UN6Q = ' (load channel diagnostics unavailable in this report)';
const LOCAL_STR_YMWJ8 = 'No load error shape available.';
const LOCAL_STR_187EA = 'distinctErrorCategories=';
const LOCAL_STR_PRELOADGATEREASONS = 'preLoadGateReasons:';
const LOCAL_STR_1KC7I = 'No report found. Pass --report <path> or place reports under ';
const LOCAL_STR_SCENARIO_2 = 'Scenario "';
const LOCAL_STR_138OI = '" not found in report: ';

const ZERO = 0;
const ONE_HUNDRED = 100;
const REPORT_EXTENSION = '.report.json';
const DEFAULT_REPORT_DIR = 'test-output/reports';
const DEFAULT_LATEST_REPORT =
  'test-output/reports/postgres-baseline-comparison-orchestrator-latest.report.json';
const TARGET_SCENARIO = 'postgres-baseline-comparison';
const ARG_REPORT = '--report';
const ARG_SCENARIO = '--scenario';
const LINE_PREFIX = '  ';

const ERROR_CATEGORY = Object.freeze({
  TIMEOUT: 'timeout',
  CIRCUIT_OPEN: 'circuit_open',
  PARTICIPANT_FAILURE: 'participant_failure',
  TABLE_NOT_FOUND: 'table_not_found',
  OTHER: 'other',
});

const STARTUP_GATE_PATTERN =
  /did not become (?:join-ready|available) within/i;
const TIMEOUT_PATTERN = /timed?\s*out|timeout|etimedout/i;
const CIRCUIT_OPEN_PATTERN = /code=circuit_open|circuit breaker is open/i;
const PARTICIPANT_FAILURE_PATTERN =
  /participant failures|distributed_participant_failure/i;
const TABLE_NOT_FOUND_PATTERN = /table not found/i;

function parseArgs(argv) {
  let reportPath = null;
  let scenarioName = TARGET_SCENARIO;
  for (let index = ZERO; index < argv.length; index += LOCAL_NUM_ONE) {
    const arg = argv[index];
    if (arg === ARG_REPORT && index + LOCAL_NUM_ONE < argv.length) {
      reportPath = String(argv[index + LOCAL_NUM_ONE]);
      index += LOCAL_NUM_ONE;
      continue;
    }
    if (arg === ARG_SCENARIO && index + LOCAL_NUM_ONE < argv.length) {
      scenarioName = String(argv[index + LOCAL_NUM_ONE] || LOCAL_STR_EMPTY).trim() || TARGET_SCENARIO;
      index += LOCAL_NUM_ONE;
    }
  }
  return {
    reportPath,
    scenarioName,
  };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (_error) {
    return false;
  }
}

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

function asFiniteNumber(value, fallback = ZERO) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

function formatPercent(numerator, denominator) {
  if (denominator <= ZERO) {
    return LOCAL_STR_N_A;
  }
  const ratio = (numerator / denominator) * ONE_HUNDRED;
  return ratio.toFixed(LOCAL_NUM_TWO) + LOCAL_STR_PERCENT;
}

function classifyErrorMessage(message) {
  const normalized = String(message || '');
  if (CIRCUIT_OPEN_PATTERN.test(normalized)) {
    return ERROR_CATEGORY.CIRCUIT_OPEN;
  }
  if (TIMEOUT_PATTERN.test(normalized)) {
    return ERROR_CATEGORY.TIMEOUT;
  }
  if (PARTICIPANT_FAILURE_PATTERN.test(normalized)) {
    return ERROR_CATEGORY.PARTICIPANT_FAILURE;
  }
  if (TABLE_NOT_FOUND_PATTERN.test(normalized)) {
    return ERROR_CATEGORY.TABLE_NOT_FOUND;
  }
  return ERROR_CATEGORY.OTHER;
}

function aggregateDistinctErrors(distinctErrors) {
  const counts = {
    [ERROR_CATEGORY.TIMEOUT]: ZERO,
    [ERROR_CATEGORY.CIRCUIT_OPEN]: ZERO,
    [ERROR_CATEGORY.PARTICIPANT_FAILURE]: ZERO,
    [ERROR_CATEGORY.TABLE_NOT_FOUND]: ZERO,
    [ERROR_CATEGORY.OTHER]: ZERO,
  };
  for (const message of distinctErrors) {
    const category = classifyErrorMessage(message);
    counts[category] += LOCAL_NUM_ONE;
  }
  return counts;
}

function resolveLoadMetrics(scenario) {
  return scenario?.loadMetrics ||
    scenario?.details?.loadMetrics ||
    scenario?.details?.details?.systemUnderTest?.metrics ||
    null;
}

function resolveDistinctErrors(scenario) {
  return scenario?.details?.loadMetrics?.distinctErrors ||
    scenario?.details?.details?.systemUnderTest?.metrics?.distinctErrors ||
    [];
}

function resolveChannelMetrics(scenario) {
  return scenario?.details?.details?.channelMetrics || null;
}

function resolvePhaseDecisions(scenario) {
  return scenario?.details?.details?.phaseDecisions || [];
}

function printLine(message = LOCAL_STR_EMPTY) {
  process.stdout.write(message + LOCAL_STR_NEWLINE);
}

function printSection(title) {
  printLine(title);
}

function printSub(message) {
  printLine(LINE_PREFIX + message);
}

function extractPreLoadReasons(phaseDecisions) {
  const decision = phaseDecisions.find((entry) => entry?.phase === 'pre_load_gate');
  if (!decision || !Array.isArray(decision.reasons)) {
    return [];
  }
  return decision.reasons;
}

function summarizeFailureShape(loadMetrics, channelMetrics) {
  if (!loadMetrics) {
    return null;
  }
  const attemptErrors = Number.isFinite(Number(loadMetrics.attemptErrors)) ?
    asFiniteNumber(loadMetrics.attemptErrors) :
    asFiniteNumber(loadMetrics.errors);
  const operationFailures = asFiniteNumber(loadMetrics.failed);
  const hasLoadChannelMetrics =
    channelMetrics?.load && typeof channelMetrics.load === 'object';
  const loadChannelErrors = hasLoadChannelMetrics ?
    asFiniteNumber(channelMetrics.load.errors) :
    null;
  const loadTimeouts = hasLoadChannelMetrics ?
    asFiniteNumber(channelMetrics.load.timeouts) :
    null;
  const fastRejectEstimate = hasLoadChannelMetrics ?
    Math.max(ZERO, attemptErrors - loadChannelErrors) :
    null;
  return {
    attemptErrors,
    operationFailures,
    loadChannelErrors,
    loadTimeouts,
    fastRejectEstimate,
  };
}

function printHeuristics({
  scenario,
  loadMetrics,
  failureShape,
  distinctErrorCounts,
}) {
  printSection(LOCAL_STR_DIAGNOSIS);
  const scenarioError = String(scenario?.error || '');
  if (scenarioError && STARTUP_GATE_PATTERN.test(scenarioError)) {
    printSub(
      LOCAL_STR_1E0TM +
      LOCAL_STR_341CN,
    );
    return;
  }

  if (!loadMetrics) {
    printSub(LOCAL_STR_1AMGS);
    return;
  }

  if (failureShape &&
      Number.isFinite(failureShape.fastRejectEstimate) &&
      failureShape.fastRejectEstimate > ZERO &&
      Number.isFinite(failureShape.loadChannelErrors) &&
      failureShape.loadChannelErrors > ZERO) {
    printSub(
      LOCAL_STR_MM91M +
      LOCAL_STR_ESTIMATED + failureShape.fastRejectEstimate + LOCAL_STR_AFTER_A_SMALLER +
      LOCAL_STR_I51O0 + failureShape.loadChannelErrors + LOCAL_STR_IE9I6,
    );
  }

  if (distinctErrorCounts[ERROR_CATEGORY.PARTICIPANT_FAILURE] > ZERO) {
    printSub(
      LOCAL_STR_QS0EQ +
      LOCAL_STR_YZ1SY,
    );
  }

  if (distinctErrorCounts[ERROR_CATEGORY.TIMEOUT] > ZERO &&
      distinctErrorCounts[ERROR_CATEGORY.CIRCUIT_OPEN] === ZERO) {
    printSub(
      LOCAL_STR_139VE +
      LOCAL_STR_1N0CZ,
    );
  }

  if (asFiniteNumber(loadMetrics.failed) === ZERO &&
      asFiniteNumber(loadMetrics.errors) === ZERO) {
    printSub(LOCAL_STR_17VIJ);
  }
}

async function findLatestReportPath(reportDir, scenarioName) {
  const entries = await readdir(reportDir, {withFileTypes: true});
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(REPORT_EXTENSION)) {
      continue;
    }
    const candidatePath = join(reportDir, entry.name);
    const fileStat = await stat(candidatePath);
    candidates.push({
      path: candidatePath,
      mtimeMs: fileStat.mtimeMs,
    });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const candidate of candidates) {
    try {
      const report = await readJson(candidate.path);
      const scenarios = Array.isArray(report?.scenarios) ? report.scenarios : [];
      if (scenarios.some((scenario) => scenario?.scenario === scenarioName)) {
        return candidate.path;
      }
    } catch (_error) {
      // Ignore malformed reports when finding the latest readable candidate.
    }
  }

  return null;
}

async function resolveReportPath(args) {
  if (args.reportPath) {
    return resolve(args.reportPath);
  }
  const latestPath = resolve(DEFAULT_LATEST_REPORT);
  if (await exists(latestPath)) {
    return latestPath;
  }
  const scanned = await findLatestReportPath(
    resolve(DEFAULT_REPORT_DIR),
    args.scenarioName,
  );
  if (scanned) {
    return resolve(scanned);
  }
  return null;
}

function printScenarioSummary(reportPath, report, scenario, scenarioName) {
  printSection(LOCAL_STR_REPORT);
  printSub(LOCAL_STR_PATH + reportPath);
  printSub(LOCAL_STR_TIMESTAMP + String(report?.timestamp || LOCAL_STR_UNKNOWN));
  printSub(
    LOCAL_STR_SUMMARY_PASSED +
    String(report?.summary?.passed ?? LOCAL_STR_N_A) +
    LOCAL_STR_SLASH +
    String(report?.summary?.total ?? LOCAL_STR_N_A) +
    LOCAL_STR_FAILED +
    String(report?.summary?.failed ?? LOCAL_STR_N_A),
  );
  printSub(LOCAL_STR_SCENARIO + scenarioName);
  printSub(LOCAL_STR_SCENARIOPASSED + String(scenario?.passed === true));
  if (scenario?.error) {
    printSub(LOCAL_STR_SCENARIOERROR + String(scenario.error));
  }
}

function printLoadSummary(loadMetrics, channelMetrics, distinctErrors) {
  printSection(LOCAL_STR_LOAD);
  if (!loadMetrics) {
    printSub(LOCAL_STR_LOADMETRICS_NONE);
    return;
  }

  const total = asFiniteNumber(loadMetrics.total);
  const success = asFiniteNumber(loadMetrics.success);
  const failed = asFiniteNumber(loadMetrics.failed);
  const errors = asFiniteNumber(loadMetrics.errors);
  const attemptErrors = Number.isFinite(Number(loadMetrics.attemptErrors)) ?
    asFiniteNumber(loadMetrics.attemptErrors) :
    errors;
  printSub(
    LOCAL_STR_OPERATIONS_TOTAL + total +
    LOCAL_STR_SUCCESS + success +
    LOCAL_STR_FAILED + failed +
    LOCAL_STR_ERRORS + errors +
    LOCAL_STR_ATTEMPTERRORS + attemptErrors,
  );
  printSub(
    LOCAL_STR_RATES_SUCCESS +
    formatPercent(success, total) +
    LOCAL_STR_FAILED +
    formatPercent(failed, total),
  );
  printSub(LOCAL_STR_OPSPERSEC + String(asFiniteNumber(loadMetrics.opsPerSec)));
  printSub(
    LOCAL_STR_LATENCYMS_P50 + String(asFiniteNumber(loadMetrics?.latency?.p50)) +
    LOCAL_STR_P95 + String(asFiniteNumber(loadMetrics?.latency?.p95)) +
    LOCAL_STR_P99 + String(asFiniteNumber(loadMetrics?.latency?.p99)),
  );

  if (channelMetrics?.load) {
    const loadChannel = channelMetrics.load;
    printSub(
      LOCAL_STR_TGPWE + String(asFiniteNumber(loadChannel.requests)) +
      LOCAL_STR_SUCCESSES + String(asFiniteNumber(loadChannel.successes)) +
      LOCAL_STR_ERRORS + String(asFiniteNumber(loadChannel.errors)) +
      LOCAL_STR_TIMEOUTS + String(asFiniteNumber(loadChannel.timeouts)) +
      LOCAL_STR_BREAKEROPENS + String(asFiniteNumber(loadChannel.breakerOpens)),
    );
  } else {
    printSub(LOCAL_STR_LOADCHANNEL_NONE);
  }

  if (distinctErrors.length > ZERO) {
    printSub(LOCAL_STR_DISTINCTERRORS + distinctErrors.length + LOCAL_STR_626BD);
    for (const error of distinctErrors) {
      printSub(LINE_PREFIX + LOCAL_STR_9XLXH + String(error));
    }
  } else {
    printSub(LOCAL_STR_5523F);
  }
}

function printDerivedSummary(failureShape, distinctErrorCounts, preLoadReasons) {
  printSection(LOCAL_STR_DERIVED);
  if (failureShape) {
    if (Number.isFinite(failureShape.loadChannelErrors)) {
      printSub(
        LOCAL_STR_ATTEMPTERRORS_2 + failureShape.attemptErrors +
        LOCAL_STR_19FSR + failureShape.loadChannelErrors +
        LOCAL_STR_LOADTIMEOUTS + failureShape.loadTimeouts +
        LOCAL_STR_WH87L + failureShape.fastRejectEstimate,
      );
    } else {
      printSub(
        LOCAL_STR_ATTEMPTERRORS_2 + failureShape.attemptErrors +
        LOCAL_STR_OPERATIONFAILURES + failureShape.operationFailures +
        LOCAL_STR_6UN6Q,
      );
    }
  } else {
    printSub(LOCAL_STR_YMWJ8);
  }

  printSub(
    LOCAL_STR_187EA +
    JSON.stringify(distinctErrorCounts),
  );

  if (preLoadReasons.length > ZERO) {
    printSub(LOCAL_STR_PRELOADGATEREASONS);
    for (const reason of preLoadReasons) {
      printSub(LINE_PREFIX + LOCAL_STR_9XLXH + String(reason));
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = await resolveReportPath(args);
  if (!reportPath) {
    throw new Error(
      LOCAL_STR_1KC7I +
      DEFAULT_REPORT_DIR,
    );
  }

  const report = await readJson(reportPath);
  const scenarios = Array.isArray(report?.scenarios) ? report.scenarios : [];
  const scenario = scenarios.find((entry) => entry?.scenario === args.scenarioName);
  if (!scenario) {
    throw new Error(
      LOCAL_STR_SCENARIO_2 + args.scenarioName + LOCAL_STR_138OI + reportPath,
    );
  }

  const loadMetrics = resolveLoadMetrics(scenario);
  const channelMetrics = resolveChannelMetrics(scenario);
  const distinctErrors = resolveDistinctErrors(scenario);
  const distinctErrorCounts = aggregateDistinctErrors(distinctErrors);
  const phaseDecisions = resolvePhaseDecisions(scenario);
  const preLoadReasons = extractPreLoadReasons(phaseDecisions);
  const failureShape = summarizeFailureShape(loadMetrics, channelMetrics);

  printScenarioSummary(reportPath, report, scenario, args.scenarioName);
  printLine();
  printLoadSummary(loadMetrics, channelMetrics, distinctErrors);
  printLine();
  printDerivedSummary(failureShape, distinctErrorCounts, preLoadReasons);
  printLine();
  printHeuristics({
    scenario,
    loadMetrics,
    failureShape,
    distinctErrorCounts,
  });
}

main().catch((error) => {
  process.stderr.write(String(error?.message || error) + LOCAL_STR_NEWLINE);
  process.exitCode = LOCAL_NUM_ONE;
});
