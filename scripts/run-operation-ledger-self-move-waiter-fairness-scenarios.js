#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';

const SCENARIO = 'operation-ledger-self-move-waiter-fairness-v3';
const REPORT_DIRECTORY = 'test-output/reports';
const GUARD_FILE =
  'test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js';
const PRODUCER = 'operation-ledger-self-move-waiter-fairness-proof';
const FIDELITY =
  'real-admission-and-workflow-owner-seams-with-virtual-progress';
const GUARD_FAILURE_REASON = 'deterministic_guard_failed';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function buildScenarioEvidence(guard) {
  const passed = guard.ok === true;
  const verdict = passed ? 'PASS' : 'FAIL';
  return {
    scenario: SCENARIO,
    passed,
    current: {
      passed,
      verdict,
      verdictReason: passed ? null : GUARD_FAILURE_REASON,
    },
    detail: {
      guard: {
        file: GUARD_FILE,
        passed,
        assertions: guard.assertions,
        elapsedMs: guard.elapsedMs,
        reasons: guard.reasons,
        tapOutput: guard.output,
        stderrOutput: guard.stderr,
      },
    },
  };
}

function buildReport(timestamp, guard) {
  const scenarioEvidence = buildScenarioEvidence(guard);
  const passCount = Number(scenarioEvidence.passed);
  return {
    timestamp,
    scenario: SCENARIO,
    producer: PRODUCER,
    fidelity: FIDELITY,
    summary: {total: 1, passed: passCount, failed: 1 - passCount},
    optimizationSummary: {totalPriorityItems: 1 - passCount},
    standardSummary: {scenarios: [scenarioEvidence]},
  };
}

function persistReport(timestamp, report) {
  const reportDir = path.join(root, REPORT_DIRECTORY);
  fs.mkdirSync(reportDir, {recursive: true});
  const stamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(
    reportDir,
    `${SCENARIO}-${stamp}.report.json`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function main() {
  const guard = runTestFileSync(GUARD_FILE, {
    print: false,
    timeoutMs: 300000,
  });
  const timestamp = new Date().toISOString();
  const report = buildReport(timestamp, guard);
  const reportPath = persistReport(timestamp, report);
  const {passed} = report.standardSummary.scenarios[0];
  const verdict = passed ? 'PASS' : 'FAIL';
  process.stdout.write(
    `${verdict} ${SCENARIO}\n` +
    `report: ${path.relative(root, reportPath)}\n`,
  );
  process.exitCode = passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {main};
