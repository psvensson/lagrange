#!/usr/bin/env node

import {readdir, readFile, stat} from 'node:fs/promises';
import {resolve, join} from 'node:path';

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
  for (let index = ZERO; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === ARG_REPORT && index + 1 < argv.length) {
      reportPath = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === ARG_SCENARIO && index + 1 < argv.length) {
      scenarioName = String(argv[index + 1] || '').trim() || TARGET_SCENARIO;
      index += 1;
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
    return 'n/a';
  }
  const ratio = (numerator / denominator) * ONE_HUNDRED;
  return ratio.toFixed(2) + '%';
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
    counts[category] += 1;
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

function printLine(message = '') {
  process.stdout.write(message + '\n');
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
  printSection('Diagnosis');
  const scenarioError = String(scenario?.error || '');
  if (scenarioError && STARTUP_GATE_PATTERN.test(scenarioError)) {
    printSub(
      'Run failed before benchmark load. Primary issue was seed bootstrap ' +
      'readiness timeout, not load-stage request handling.',
    );
    return;
  }

  if (!loadMetrics) {
    printSub('No load metrics were recorded for this scenario.');
    return;
  }

  if (failureShape &&
      Number.isFinite(failureShape.fastRejectEstimate) &&
      failureShape.fastRejectEstimate > ZERO &&
      Number.isFinite(failureShape.loadChannelErrors) &&
      failureShape.loadChannelErrors > ZERO) {
    printSub(
      'Most load-side failures were likely fast circuit-breaker rejections ' +
      '(estimated ' + failureShape.fastRejectEstimate + ') after a smaller ' +
      'set of actual load-channel exceptions (' + failureShape.loadChannelErrors + ').',
    );
  }

  if (distinctErrorCounts[ERROR_CATEGORY.PARTICIPANT_FAILURE] > ZERO) {
    printSub(
      'Participant-failure envelopes were observed. These are distributed ' +
      'query-level failures and should be correlated with partition-level diagnostics.',
    );
  }

  if (distinctErrorCounts[ERROR_CATEGORY.TIMEOUT] > ZERO &&
      distinctErrorCounts[ERROR_CATEGORY.CIRCUIT_OPEN] === ZERO) {
    printSub(
      'Timeouts appear without circuit-open dominance; investigate slow query ' +
      'path or load timeout budget.',
    );
  }

  if (asFiniteNumber(loadMetrics.failed) === ZERO &&
      asFiniteNumber(loadMetrics.errors) === ZERO) {
    printSub('No load errors were reported.');
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
  printSection('Report');
  printSub('path: ' + reportPath);
  printSub('timestamp: ' + String(report?.timestamp || 'unknown'));
  printSub(
    'summary: passed=' +
    String(report?.summary?.passed ?? 'n/a') +
    '/' +
    String(report?.summary?.total ?? 'n/a') +
    ', failed=' +
    String(report?.summary?.failed ?? 'n/a'),
  );
  printSub('scenario: ' + scenarioName);
  printSub('scenarioPassed: ' + String(scenario?.passed === true));
  if (scenario?.error) {
    printSub('scenarioError: ' + String(scenario.error));
  }
}

function printLoadSummary(loadMetrics, channelMetrics, distinctErrors) {
  printSection('Load');
  if (!loadMetrics) {
    printSub('loadMetrics: none');
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
    'operations: total=' + total +
    ', success=' + success +
    ', failed=' + failed +
    ', errors=' + errors +
    ', attemptErrors=' + attemptErrors,
  );
  printSub(
    'rates: success=' +
    formatPercent(success, total) +
    ', failed=' +
    formatPercent(failed, total),
  );
  printSub('opsPerSec: ' + String(asFiniteNumber(loadMetrics.opsPerSec)));
  printSub(
    'latencyMs: p50=' + String(asFiniteNumber(loadMetrics?.latency?.p50)) +
    ', p95=' + String(asFiniteNumber(loadMetrics?.latency?.p95)) +
    ', p99=' + String(asFiniteNumber(loadMetrics?.latency?.p99)),
  );

  if (channelMetrics?.load) {
    const loadChannel = channelMetrics.load;
    printSub(
      'loadChannel: requests=' + String(asFiniteNumber(loadChannel.requests)) +
      ', successes=' + String(asFiniteNumber(loadChannel.successes)) +
      ', errors=' + String(asFiniteNumber(loadChannel.errors)) +
      ', timeouts=' + String(asFiniteNumber(loadChannel.timeouts)) +
      ', breakerOpens=' + String(asFiniteNumber(loadChannel.breakerOpens)),
    );
  } else {
    printSub('loadChannel: none');
  }

  if (distinctErrors.length > ZERO) {
    printSub('distinctErrors (' + distinctErrors.length + '):');
    for (const error of distinctErrors) {
      printSub(LINE_PREFIX + '- ' + String(error));
    }
  } else {
    printSub('distinctErrors: none');
  }
}

function printDerivedSummary(failureShape, distinctErrorCounts, preLoadReasons) {
  printSection('Derived');
  if (failureShape) {
    if (Number.isFinite(failureShape.loadChannelErrors)) {
      printSub(
        'attemptErrors=' + failureShape.attemptErrors +
        ', loadChannelExceptions=' + failureShape.loadChannelErrors +
        ', loadTimeouts=' + failureShape.loadTimeouts +
        ', estimatedFastRejects=' + failureShape.fastRejectEstimate,
      );
    } else {
      printSub(
        'attemptErrors=' + failureShape.attemptErrors +
        ', operationFailures=' + failureShape.operationFailures +
        ' (load channel diagnostics unavailable in this report)',
      );
    }
  } else {
    printSub('No load error shape available.');
  }

  printSub(
    'distinctErrorCategories=' +
    JSON.stringify(distinctErrorCounts),
  );

  if (preLoadReasons.length > ZERO) {
    printSub('preLoadGateReasons:');
    for (const reason of preLoadReasons) {
      printSub(LINE_PREFIX + '- ' + String(reason));
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = await resolveReportPath(args);
  if (!reportPath) {
    throw new Error(
      'No report found. Pass --report <path> or place reports under ' +
      DEFAULT_REPORT_DIR,
    );
  }

  const report = await readJson(reportPath);
  const scenarios = Array.isArray(report?.scenarios) ? report.scenarios : [];
  const scenario = scenarios.find((entry) => entry?.scenario === args.scenarioName);
  if (!scenario) {
    throw new Error(
      'Scenario "' + args.scenarioName + '" not found in report: ' + reportPath,
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
  process.stderr.write(String(error?.message || error) + '\n');
  process.exitCode = 1;
});
