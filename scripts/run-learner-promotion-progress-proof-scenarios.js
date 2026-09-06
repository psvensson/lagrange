/**
 * Scenario runner for the sealed doneWhen of quest
 * learner-promotion-progress-proof: runs the committed deterministic guard
 * file for scenario 'learner-promotion-progress-proof' (a five-node
 * recovery scenario over the real promotion owners) and writes a
 * scenario-harness report in the shape the Solver probe reads
 * (`scripts/solve/probes.js`).
 *
 * Verdict honesty: a run whose guard process never measured (timeout,
 * spawn failure, TAP stream incomplete, zero assertions) emits
 * verdictReason 'execution_incomplete_or_metrics_missing' — a
 * NON_MEASURING_VERDICT_REASONS member — so the probe skips it as a
 * non-measuring sample instead of reading a broken harness as red/green.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';

const SCENARIO = 'learner-promotion-progress-proof';
const GUARD_FILES = [
  'test/convergence/dt6-learner-promotion-progress-proof.test.js',
];
const REPORTS_DIRECTORY = 'test-output/reports';
const GUARD_FILE_TIMEOUT_MS = 300000;
const FIDELITY = 'deterministic-guard';
const PRODUCER = 'learner-promotion-progress-proof-runner';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const VERDICT_REASON_ALL_PASS = 'all_guard_files_green';
const VERDICT_REASON_GUARD_FAILED = 'guard_test_failed';
const VERDICT_REASON_NON_MEASURING = 'execution_incomplete_or_metrics_missing';
// Reason substrings that mean the guard process never measured (see
// FAILURE_REASON in run-test-files.js); a plain assertion failure is a
// MEASURING red and must stay one.
const NON_MEASURING_REASON_PATTERNS = [
  'timed out',
  'no assertions executed',
  'TAP stream did not complete',
  'received',
  'spawn',
];
const EXIT_CODE_PASS = 0;
const EXIT_CODE_FAIL = 1;
const TAP_OK = 'ok';
const TAP_NOT_OK = 'not ok';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isNonMeasuringResult(result) {
  if (result.ok) {
    return false;
  }
  const reasons = Array.isArray(result.reasons) ? result.reasons : [];
  return NON_MEASURING_REASON_PATTERNS.some((pattern) =>
    reasons.some((reason) => String(reason).includes(pattern)),
  );
}

function runGuardFile(file) {
  const result = runTestFileSync(file, {
    print: false,
    timeoutMs: GUARD_FILE_TIMEOUT_MS,
  });
  return {
    file,
    passed: result.ok,
    nonMeasuring: isNonMeasuringResult(result),
    assertions: result.assertions,
    reasons: result.reasons,
    elapsedMs: result.elapsedMs,
  };
}

const results = GUARD_FILES.map(runGuardFile);
const failing = results.filter((entry) => !entry.passed);
const passed = failing.length === 0;
const nonMeasuring = failing.some((entry) => entry.nonMeasuring);
const verdictReason = passed ?
  VERDICT_REASON_ALL_PASS :
  nonMeasuring ?
    VERDICT_REASON_NON_MEASURING :
    VERDICT_REASON_GUARD_FAILED;

const report = {
  timestamp: new Date().toISOString(),
  scenario: SCENARIO,
  producer: PRODUCER,
  fidelity: FIDELITY,
  summary: {
    total: results.length,
    passed: results.length - failing.length,
    failed: failing.length,
  },
  optimizationSummary: {totalPriorityItems: failing.length},
  standardSummary: {
    scenarios: [{
      scenario: SCENARIO,
      passed,
      current: {
        passed,
        verdict: passed ? VERDICT_PASS : VERDICT_FAIL,
        verdictReason,
      },
      detail: {guardTests: results},
    }],
  },
};

const reportDir = path.join(root, REPORTS_DIRECTORY);
fs.mkdirSync(reportDir, {recursive: true});
const reportPath = path.join(
  reportDir,
  `${SCENARIO}-${report.timestamp.replace(/[:.]/g, '-')}.report.json`,
);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`${passed ? VERDICT_PASS : VERDICT_FAIL} ${SCENARIO}: ` +
  `${report.summary.passed}/${report.summary.total} guard files green`);
for (const entry of results) {
  console.log(`  ${entry.passed ? TAP_OK : TAP_NOT_OK} ${entry.file} - ` +
    `${entry.assertions} assertions (${entry.elapsedMs}ms)`);
}
console.log(`report: ${path.relative(root, reportPath)}`);
process.exitCode = passed ? EXIT_CODE_PASS : EXIT_CODE_FAIL;
