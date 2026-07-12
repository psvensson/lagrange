#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {runTestFileSync} from './run-test-files.js';

const SCENARIO = 'solver-deletion-safe-handoff-recovery';
const TEST_FILES = Object.freeze([
  'test/solve/handoff.test.js',
  'test/solve/step-auto-diff.test.js',
]);
const REPORT_DIR = 'test-output/reports';
const TEST_TIMEOUT_MS = 300000;
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const REPORT_FIDELITY = 'deterministic-guard';

const guards = TEST_FILES.map((file) => ({
  file,
  ...runTestFileSync(file, {print: false, timeoutMs: TEST_TIMEOUT_MS}),
}));
const passedChecks = guards.filter((guard) => guard.ok).length;
const failed = guards.length - passedChecks;
const passed = failed === 0;
const timestamp = new Date().toISOString();
const report = {
  timestamp,
  scenario: SCENARIO,
  producer: SCENARIO,
  fidelity: REPORT_FIDELITY,
  summary: {total: guards.length, passed: passedChecks, failed},
  optimizationSummary: {totalPriorityItems: failed},
  standardSummary: {
    scenarios: [{
      scenario: SCENARIO,
      passed,
      current: {passed, verdict: passed ? VERDICT_PASS : VERDICT_FAIL},
      detail: {
        guards: guards.map((guard) => ({
          file: guard.file,
          passed: guard.ok,
          assertions: guard.assertions,
        })),
      },
    }],
  },
};
fs.mkdirSync(REPORT_DIR, {recursive: true});
const stamp = timestamp.replace(/[:.]/gu, '-');
const reportPath = path.join(REPORT_DIR, `${SCENARIO}-${stamp}.report.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, undefined, 2)}\n`);
process.stdout.write(
  `${SCENARIO}: ${passed ? VERDICT_PASS : VERDICT_FAIL} — ` +
  `${guards.reduce((sum, guard) => sum + guard.assertions, 0)} assertions\n` +
  `report: ${reportPath}\n`,
);
process.exitCode = passed ? 0 : 1;
