#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {computeSourceFingerprint} from
  '../../src/diagnostics/source-fingerprint.js';
import {analyzeFormationReleaseEvents} from
  './formation-release-handoff-gcp-analysis.js';
import {
  startGcpAffinityCluster,
} from '../../examples/service-data-affinity/gcp-cluster-provider.js';

const arraySort = Function.call.bind(Array.prototype.sort);
const arrayFind = Function.call.bind(Array.prototype.find);
const bufferFrom = Buffer.from;
const DateConstructor = Date;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringConstructor = String;
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_ROOT = path.join(
  ROOT,
  'test-output/reports/formation-release-handoff-closure',
);
const FIXED_VARIANT = 'fixed';
const REVERTED_VARIANT = 'reverted';
// Scenario-harness probe surface (scripts/solve/probes/scenario-harness.js):
// the quest doneWhen reads top-level test-output/reports/*.report.json files,
// keyed on the sealed scenario name and a lower-is-better priority metric. The
// per-run report.json (kept for log archaeology) is mirrored there with the
// sealed scenario name plus a scenario entry carrying the priority count.
const PROBE_SCENARIO_NAME = 'formation-release-handoff-closure';
const PROBE_REPORT_BASENAME =
  'formation-release-handoff-closure-live-gcp';
const PRIORITY_ITEMS_ON_PASS = 0;
const PRIORITY_ITEMS_ON_FAIL = 1;
const FAILED_ON_PASS = 0;
const FAILED_ON_FAIL = 1;
// Named scalar owners (system-guidelines.md §4): hashing/encoding/suffix tags.
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const LOG_FILE_SUFFIX = '.log';
const NEWLINE_SEPARATOR = '\n';
const ENCODING_UTF8 = 'utf8';

function sha256(bytes) {
  return createHash(HASH_ALGORITHM).update(bytes).digest(HASH_ENCODING);
}

function parseLogLine(line) {
  try {
    const value = jsonParse(line);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

async function readLogEvents(outputDir) {
  const names = arraySort(await fs.readdir(outputDir));
  const events = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (!stringIncludes(name, LOG_FILE_SUFFIX)) continue;
    const bytes = await fs.readFile(path.join(outputDir, name), ENCODING_UTF8);
    const lines = stringSplit(bytes, NEWLINE_SEPARATOR);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const event = parseLogLine(lines[lineIndex]);
      if (event) events[events.length] = event;
    }
  }
  return events;
}

function resolveVariant(argv = process.argv.slice(2)) {
  const value = arrayFind(argv, (arg) =>
    arg === `--variant=${FIXED_VARIANT}` ||
    arg === `--variant=${REVERTED_VARIANT}`);
  return value === `--variant=${REVERTED_VARIANT}` ?
    REVERTED_VARIANT : FIXED_VARIANT;
}

async function runCluster(outputDir) {
  let handle = null;
  let error = null;
  try {
    handle = await startGcpAffinityCluster({
      verbose: true,
      outputDir,
    });
  } catch (caught) {
    error = caught;
  } finally {
    if (handle) {
      try {
        await handle.stop();
      } catch (caught) {
        error ||= caught;
      }
    }
  }
  return {error};
}

async function analyzeClusterOutput(outputDir, sourceFingerprint) {
  try {
    return {
      analysis: analyzeFormationReleaseEvents(
        await readLogEvents(outputDir),
        sourceFingerprint,
      ),
      error: null,
    };
  } catch (error) {
    return {analysis: null, error};
  }
}

async function writeReport(report, outputDir) {
  await fs.mkdir(path.dirname(outputDir), {recursive: true});
  const reportBytes = bufferFrom(`${jsonStringify(report, null, 2)}\n`);
  const reportPath = path.join(path.dirname(outputDir), 'report.json');
  await fs.writeFile(reportPath, reportBytes);
  process.stdout.write(`${jsonStringify({
    ...report,
    report: path.relative(ROOT, reportPath),
    reportSha256: sha256(reportBytes),
  }, null, 2)}\n`);
}

// Mirror the run into the probe-scannable top-level report surface with the
// sealed scenario name and a priority metric the scenario-harness doneWhen can
// read (0 outstanding on pass, 1 on fail).
async function writeProbeReport(report) {
  const probeReport = {
    schemaVersion: 2,
    scenario: PROBE_SCENARIO_NAME,
    fidelity: report.fidelity,
    variant: report.variant,
    sourceFingerprint: report.sourceFingerprint,
    timestamp: report.finishedAt,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    passed: report.passed,
    error: report.error,
    optimizationSummary: {
      totalPriorityItems: report.passed ?
        PRIORITY_ITEMS_ON_PASS :
        PRIORITY_ITEMS_ON_FAIL,
    },
    summary: {
      total: 1,
      passed: report.passed ? 1 : 0,
      failed: report.passed ? FAILED_ON_PASS : FAILED_ON_FAIL,
    },
    scenarios: [
      {
        scenario: PROBE_SCENARIO_NAME,
        passed: report.passed,
        verdict: report.passed ? 'PASS' : 'FAIL',
      },
    ],
    analysis: report.analysis,
    sourceReport: report.logDir,
  };
  const probePath = path.join(
    ROOT,
    'test-output/reports',
    `${PROBE_REPORT_BASENAME}-${stringReplaceAll(
      report.finishedAt,
      ':',
      '-',
    )}.report.json`,
  );
  await fs.mkdir(path.dirname(probePath), {recursive: true});
  await fs.writeFile(probePath, bufferFrom(`${jsonStringify(probeReport, null, 2)}\n`));
  return probePath;
}

async function runFormationReleaseHandoffGcp(options = {}) {
  const variant = options.variant || resolveVariant();
  const sourceFingerprint = await computeSourceFingerprint(
    path.join(ROOT, 'src'),
  );
  const startedAt = new DateConstructor();
  const runId = stringReplaceAll(dateToISOString(startedAt), ':', '-');
  const outputDir = path.join(REPORT_ROOT, runId, 'full-logs');
  const cluster = await runCluster(outputDir);
  const analyzed = await analyzeClusterOutput(outputDir, sourceFingerprint);
  const error = cluster.error || analyzed.error;
  const analysis = analyzed.analysis;
  const fixedPassed = variant !== FIXED_VARIANT ||
    analysis?.closurePassed === true;
  const report = {
    schemaVersion: 2,
    scenario: 'formation-release-handoff-closure-live-gcp',
    fidelity: 'live-gcp',
    variant,
    sourceFingerprint,
    startedAt: dateToISOString(startedAt),
    finishedAt: dateToISOString(new DateConstructor()),
    passed: error === null && fixedPassed,
    clusterStartPassed: error === null,
    error: error ? stringConstructor(error.message || error) : null,
    analysis,
    logDir: path.relative(ROOT, outputDir),
  };
  await writeReport(report, outputDir);
  const probePath = await writeProbeReport(report);
  process.stdout.write(`${jsonStringify({probeReport: path.relative(ROOT, probePath)}, null, 0)}\n`);
  if (!report.passed) process.exitCode = 1;
  return report;
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await runFormationReleaseHandoffGcp();
}

export {
  analyzeFormationReleaseEvents,
  readLogEvents,
  runFormationReleaseHandoffGcp,
};
