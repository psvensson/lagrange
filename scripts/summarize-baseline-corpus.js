#!/usr/bin/env node

import {readdir, readFile, stat, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const REPORT_DIR_DEFAULT = 'test-output/reports';
const OUTPUT_FILE_DEFAULT =
  'test-output/reports/postgres-baseline-failure-corpus.summary.json';
const REPORT_EXTENSION = '.report.json';
const TARGET_SCENARIO = 'postgres-baseline-comparison';
const REPORT_PATH_SEPARATOR = '/';
const REPORT_ID_SUFFIX = '.report.json';
const RUN_COMMAND_PREFIX = 'node test/distributed/run.js --config ';
const RUN_COMMAND_SCENARIO =
  ' --scenario postgres-baseline-comparison --output ';
const RUN_COMMAND_REPORT_PREFIX = 'test-output/reports/';
const ZERO = 0;

const PROFILE = Object.freeze({
  THREE_NODE: '3node',
  SEVEN_NODE: '7node',
  UNKNOWN: 'unknown',
});

const FAILURE_CLASS = Object.freeze({
  ACTIVE_TIMEOUT: 'active_timeout',
  DISCOVERY_EMPTY: 'discovery_empty',
  CONVERGENCE_TIMEOUT: 'convergence_timeout',
  CONSISTENCY_QUERYABLE: 'consistency_queryable',
  PHASE_FAILURE: 'phase_failure',
  OTHER: 'other',
});

const ACTIVE_TIMEOUT_PATTERN = /not all nodes reached active state/i;
const DISCOVERY_EMPTY_PATTERN =
  /no discovered reachable .*nodes available/i;
const CONVERGENCE_TIMEOUT_PATTERN = /convergence timeout/i;
const CONSISTENCY_QUERYABLE_PATTERN =
  /fewer than 2 queryable nodes/i;
const PHASE_FAILURE_PATTERN = /failed in phase/i;

function parseArgs(argv) {
  const options = {
    reportDir: REPORT_DIR_DEFAULT,
    outputFile: OUTPUT_FILE_DEFAULT,
  };

  for (let index = ZERO; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--report-dir' && index + 1 < argv.length) {
      options.reportDir = String(argv[index + 1]);
      index++;
      continue;
    }
    if (arg === '--output' && index + 1 < argv.length) {
      options.outputFile = String(argv[index + 1]);
      index++;
      continue;
    }
  }

  return options;
}

function classifyProfile(fileName) {
  const normalized = String(fileName || '').toLowerCase();
  if (normalized.includes(PROFILE.SEVEN_NODE)) {
    return PROFILE.SEVEN_NODE;
  }
  if (normalized.includes(PROFILE.THREE_NODE)) {
    return PROFILE.THREE_NODE;
  }
  return PROFILE.UNKNOWN;
}

function classifyFailure(errorMessage) {
  const message = String(errorMessage || '');
  if (ACTIVE_TIMEOUT_PATTERN.test(message)) {
    return FAILURE_CLASS.ACTIVE_TIMEOUT;
  }
  if (DISCOVERY_EMPTY_PATTERN.test(message)) {
    return FAILURE_CLASS.DISCOVERY_EMPTY;
  }
  if (CONVERGENCE_TIMEOUT_PATTERN.test(message)) {
    return FAILURE_CLASS.CONVERGENCE_TIMEOUT;
  }
  if (CONSISTENCY_QUERYABLE_PATTERN.test(message)) {
    return FAILURE_CLASS.CONSISTENCY_QUERYABLE;
  }
  if (PHASE_FAILURE_PATTERN.test(message)) {
    return FAILURE_CLASS.PHASE_FAILURE;
  }
  return FAILURE_CLASS.OTHER;
}

function ensureHistogramValue(histogram, key) {
  if (!Object.prototype.hasOwnProperty.call(histogram, key)) {
    histogram[key] = ZERO;
  }
  return histogram;
}

function incrementHistogram(histogram, key) {
  ensureHistogramValue(histogram, key);
  histogram[key] += 1;
}

function createProfileAccumulator() {
  return {
    latestPassing: null,
    latestFailing: null,
    passingReports: [],
    failingReports: [],
    failureClassHistogram: {},
  };
}

function toReportSummary(fileName, filePath, mtimeMs, scenario) {
  const reportId = fileName.endsWith(REPORT_ID_SUFFIX) ?
    fileName.slice(ZERO, -REPORT_ID_SUFFIX.length) :
    fileName;
  return {
    reportId,
    fileName,
    path: filePath,
    mtimeMs,
    timestamp: scenario?.startedAt || null,
    passed: scenario?.passed === true,
    error: scenario?.error || null,
    configPath: typeof scenario?.configPath === 'string' ?
      scenario.configPath :
      null,
    scenarioName: typeof scenario?.scenarioName === 'string' ?
      scenario.scenarioName :
      TARGET_SCENARIO,
  };
}

async function readScenarioReport(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const report = JSON.parse(raw);
  const scenarios = Array.isArray(report?.scenarios) ? report.scenarios : [];
  const scenario = scenarios.find((entry) =>
    String(entry?.scenario || '') === TARGET_SCENARIO,
  );
  if (!scenario) {
    return null;
  }

  return {
    scenario,
    configPath: typeof report?.metadata?.configPath === 'string' &&
      report.metadata.configPath.length > ZERO ?
      report.metadata.configPath :
      null,
  };
}

function resolveReportFileName(summary) {
  if (typeof summary?.fileName === 'string' && summary.fileName.length > ZERO) {
    return summary.fileName;
  }
  if (typeof summary?.path !== 'string') {
    return null;
  }
  const parts = summary.path.split(REPORT_PATH_SEPARATOR);
  if (parts.length <= ZERO) {
    return null;
  }
  return parts[parts.length - 1];
}

function buildReproCommand(summary) {
  const configPath = typeof summary?.configPath === 'string' &&
    summary.configPath.length > ZERO ?
    summary.configPath :
    null;
  const reportFile = resolveReportFileName(summary);
  if (!configPath || !reportFile) {
    return null;
  }
  return RUN_COMMAND_PREFIX +
    configPath +
    RUN_COMMAND_SCENARIO +
    RUN_COMMAND_REPORT_PREFIX +
    reportFile;
}

function toSeedMatrixEntry(summary) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  return {
    reportId: summary.reportId || null,
    fileName: summary.fileName || null,
    timestamp: summary.timestamp || null,
    configPath: summary.configPath || null,
    command: buildReproCommand(summary),
  };
}

function createSeedMatrix(bucket) {
  return {
    latestPassing: toSeedMatrixEntry(bucket.latestPassing),
    latestFailing: toSeedMatrixEntry(bucket.latestFailing),
  };
}

async function collectCorpus(reportDir) {
  const entries = await readdir(reportDir, {withFileTypes: true});
  const accumulators = {
    [PROFILE.THREE_NODE]: createProfileAccumulator(),
    [PROFILE.SEVEN_NODE]: createProfileAccumulator(),
    [PROFILE.UNKNOWN]: createProfileAccumulator(),
  };

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(REPORT_EXTENSION)) {
      continue;
    }
    const filePath = join(reportDir, entry.name);
    const reportEntry = await readScenarioReport(filePath);
    if (!reportEntry) {
      continue;
    }

    const {mtimeMs} = await stat(filePath);
    const profile = classifyProfile(entry.name);
    const bucket = accumulators[profile];
    const summary = toReportSummary(
      entry.name,
      resolve(filePath),
      mtimeMs,
      {
        ...reportEntry.scenario,
        configPath: reportEntry.configPath,
        scenarioName: TARGET_SCENARIO,
      },
    );

    if (summary.passed) {
      bucket.passingReports.push(summary);
      if (!bucket.latestPassing || summary.mtimeMs > bucket.latestPassing.mtimeMs) {
        bucket.latestPassing = summary;
      }
      continue;
    }

    const failureClass = classifyFailure(summary.error);
    summary.failureClass = failureClass;
    bucket.failingReports.push(summary);
    incrementHistogram(bucket.failureClassHistogram, failureClass);
    if (!bucket.latestFailing || summary.mtimeMs > bucket.latestFailing.mtimeMs) {
      bucket.latestFailing = summary;
    }
  }

  const finalize = (bucket) => {
    bucket.passingReports.sort((left, right) => right.mtimeMs - left.mtimeMs);
    bucket.failingReports.sort((left, right) => right.mtimeMs - left.mtimeMs);
    bucket.passingReports = bucket.passingReports.slice(0, 10);
    bucket.failingReports = bucket.failingReports.slice(0, 10);
    bucket.seedMatrix = createSeedMatrix(bucket);
    return bucket;
  };

  return {
    [PROFILE.THREE_NODE]: finalize(accumulators[PROFILE.THREE_NODE]),
    [PROFILE.SEVEN_NODE]: finalize(accumulators[PROFILE.SEVEN_NODE]),
    [PROFILE.UNKNOWN]: finalize(accumulators[PROFILE.UNKNOWN]),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpus = await collectCorpus(args.reportDir);
  const output = {
    generatedAt: new Date().toISOString(),
    scenario: TARGET_SCENARIO,
    reportDir: resolve(args.reportDir),
    profiles: corpus,
  };

  await writeFile(args.outputFile, JSON.stringify(output, null, 2) + '\n', 'utf8');
  process.stdout.write(
    'Wrote baseline corpus summary to ' + resolve(args.outputFile) + '\n',
  );
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + '\n');
  process.exitCode = 1;
});
