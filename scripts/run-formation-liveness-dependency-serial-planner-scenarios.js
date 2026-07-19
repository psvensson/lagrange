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
import {
  resolveLiveConfirmationGate,
} from './run-effective-placement-serial-priority-planner-scenarios.js';

const SCENARIO = 'formation-liveness-dependency-serial-planner';
const REPORT_DIR = resolve('test-output/reports');
const TEXT_ENCODING = 'utf8';
const ENTRYPOINT_FILE =
  'run-formation-liveness-dependency-serial-planner-scenarios.js';
const GUARD_FILE_TIMEOUT_MS = 300000;
const LIVE_GATE_EVIDENCE =
  'live:5-probes-then-3-demos-on-one-source-fingerprint';
const GUARD_FILES = Object.freeze([
  'test/rebalancer/formation-liveness-dependency-serial-planner.test.js',
  'test/rebalancer/effective-placement-serial-priority-planner.test.js',
  'test/rebalancer/unified-rebalancer-triggers-critical-deferral.test.js',
  'test/rebalancer/unified-rebalancer-triggers-publication-visibility.test.js',
  'test/rebalancer/provisioning-admission-policy.test.js',
  'test/rebalancer/replica-inventory.test.js',
  'test/bootstrap/system-partition-classification-owner.test.js',
  'test/bootstrap/traffic-readiness-utils.test.js',
  'test/admin/admin-control-snapshot-heartbeat-lease-freshness.test.js',
  'test/convergence/dt-formation-priority-placement-before-active.test.js',
  'test/scripts/effective-placement-serial-priority-planner-scenario.test.js',
]);

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
    producer: 'formation-liveness-dependency-scenario-runner',
    fidelity: 'deterministic-with-live-aggregate',
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
          verdict: passed ? 'PASS' : 'FAIL',
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
  const results = GUARD_FILES.map(runGuardFile);
  const report = buildReport(results, liveGate);
  const reportPath = writeReport(report);
  process.stdout.write(
    `${SCENARIO}: ${report.summary.failed === 0 ? 'PASS' : 'FAIL'} — ` +
    `${report.summary.passed}/${report.summary.total} evidence checks green ` +
    `(${results.map((result) =>
      `${basename(result.file)}=${result.assertionsPassed}/` +
      `${result.assertions}`).join(' ')} ` +
    `${LIVE_GATE_EVIDENCE}=${liveGate.passed ? '1/1' : '0/1'})\n` +
    `report: ${reportPath}\n`,
  );
  process.exitCode = report.summary.failed === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith(ENTRYPOINT_FILE)) {
  await main();
}
