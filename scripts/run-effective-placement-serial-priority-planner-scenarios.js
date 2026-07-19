#!/usr/bin/env node

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {basename, resolve} from 'node:path';
import {
  computeSourceFingerprint,
} from '../src/diagnostics/source-fingerprint.js';
import {runTestFileSync} from './run-test-files.js';

const SCENARIO = 'effective-placement-serial-priority-planner';
const REPORT_DIR = resolve('test-output/reports');
const TEXT_ENCODING = 'utf8';
const ENTRYPOINT_FILE =
  'run-effective-placement-serial-priority-planner-scenarios.js';
const GUARD_FILE_TIMEOUT_MS = 300000;
const LIVE_GATE_EVIDENCE =
  'live:5-probes-then-3-demos-on-one-source-fingerprint';
const REPORT_PRODUCER =
  'effective-placement-serial-priority-planner-scenario-runner';
const REPORT_FIDELITY = 'deterministic-with-live-aggregate';
const DISPLAY = Object.freeze({
  JOIN_SEPARATOR: ' ',
  LIVE_FAIL: '0/1',
  LIVE_PASS: '1/1',
});
const VERDICT = Object.freeze({
  FAIL: 'FAIL',
  PASS: 'PASS',
});
const SCENARIOS = {
  [SCENARIO]: [
    'test/rebalancer/effective-placement-serial-priority-planner.test.js',
    'test/rebalancer/replica-inventory.test.js',
    'test/rebalancer/move-planner-spread-vs-count-reconciliation.test.js',
    'test/rebalancer/move-planner-critical-replace-serialization.test.js',
    'test/rebalancer/priority-remove-safety-spread-nonregression.test.js',
    'test/rebalancer/unified-rebalancer-triggers-priority-surrogate-followup.test.js',
    'test/convergence/dt-formation-priority-placement-before-active.test.js',
    'test/scripts/effective-placement-serial-priority-planner-scenario.test.js',
  ],
};

function parseSummaryFile(file) {
  try {
    return {
      file,
      value: JSON.parse(readFileSync(resolve(REPORT_DIR, file), TEXT_ENCODING)),
    };
  } catch {
    return null;
  }
}

function liveSummaries() {
  try {
    return readdirSync(REPORT_DIR)
      .filter((file) =>
        /^live-repetitions-(?:probe|demo)-.+\.summary\.json$/u.test(file),
      )
      .map(parseSummaryFile)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isValidSummary(summary, runClass, repetitions, fingerprint) {
  return summary?.value?.runClass === runClass &&
    summary.value.policy?.repetitions === repetitions &&
    summary.value.gatePassed === true &&
    summary.value.inconclusive === false &&
    summary.value.sourceStable === true &&
    summary.value.sourceFingerprint === fingerprint &&
    summary.value.completedSourceFingerprint === fingerprint &&
    typeof summary.value.sessionStartedAt === 'string' &&
    typeof summary.value.sessionCompletedAt === 'string';
}

export function resolveLiveConfirmationGate(summaries, fingerprint) {
  const probes = summaries
    .filter((summary) => isValidSummary(summary, 'probe', 5, fingerprint))
    .sort((a, b) =>
      b.value.sessionCompletedAt.localeCompare(a.value.sessionCompletedAt),
    );
  const demos = summaries
    .filter((summary) => isValidSummary(summary, 'demo', 3, fingerprint))
    .sort((a, b) =>
      b.value.sessionCompletedAt.localeCompare(a.value.sessionCompletedAt),
    );
  const probe = probes[0] || null;
  const demo = probe ?
    demos.find((candidate) =>
      candidate.value.sessionStartedAt >= probe.value.sessionCompletedAt,
    ) || null :
    null;
  return {
    passed: Boolean(probe && demo),
    probeSummary: probe?.file || null,
    demoSummary: demo?.file || null,
    sourceFingerprint: fingerprint,
  };
}

function runGuardFile(file) {
  const result = runTestFileSync(file, {
    print: false,
    timeoutMs: GUARD_FILE_TIMEOUT_MS,
  });
  return {
    file,
    passed: result.ok,
    assertions: result.assertions,
    assertionsPassed: result.ok ? result.assertions : 0,
  };
}

function buildReport(results, liveGate) {
  const timestamp = new Date().toISOString();
  const liveResult = {
    file: LIVE_GATE_EVIDENCE,
    passed: liveGate.passed,
    assertions: 1,
    assertionsPassed: liveGate.passed ? 1 : 0,
    detail: liveGate,
  };
  const allResults = [...results, liveResult];
  const failing = allResults.filter((result) => !result.passed);
  const passed = failing.length === 0;
  return {
    timestamp,
    scenario: SCENARIO,
    producer: REPORT_PRODUCER,
    fidelity: REPORT_FIDELITY,
    summary: {
      total: allResults.length,
      passed: allResults.length - failing.length,
      failed: failing.length,
    },
    optimizationSummary: {
      totalPriorityItems: failing.length,
    },
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
        passed,
        current: {
          passed,
          verdict: passed ? VERDICT.PASS : VERDICT.FAIL,
        },
        detail: {
          guardTests: results,
          liveConfirmationGate: liveResult,
        },
      }],
    },
  };
}

function writeReport(report) {
  mkdirSync(REPORT_DIR, {recursive: true});
  const fileStamp = report.timestamp.replace(/[:.]/gu, '-');
  const reportPath = resolve(
    REPORT_DIR,
    `${SCENARIO}-${fileStamp}.report.json`,
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function main() {
  const only = process.argv[2];
  if (only && only !== SCENARIO) {
    process.stderr.write(`unknown scenario: ${only}\n`);
    process.exitCode = 2;
    return;
  }
  const sourceFingerprint = await computeSourceFingerprint(resolve('src'));
  const liveGate = resolveLiveConfirmationGate(
    liveSummaries(),
    sourceFingerprint,
  );
  const results = SCENARIOS[SCENARIO].map(runGuardFile);
  const report = buildReport(results, liveGate);
  const reportPath = writeReport(report);
  process.stdout.write(
    `${SCENARIO}: ${report.summary.failed === 0 ? VERDICT.PASS : VERDICT.FAIL}` +
    ` — ${report.summary.passed}/${report.summary.total} evidence checks green ` +
    `(${results.map((result) =>
      `${basename(result.file)}=${result.assertionsPassed}/` +
      `${result.assertions}`).join(DISPLAY.JOIN_SEPARATOR)} ` +
    `${LIVE_GATE_EVIDENCE}=${liveGate.passed ?
      DISPLAY.LIVE_PASS :
      DISPLAY.LIVE_FAIL})\n` +
    `report: ${reportPath}\n`,
  );
  process.exitCode = report.summary.failed === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith(
  ENTRYPOINT_FILE,
)) {
  await main();
}
