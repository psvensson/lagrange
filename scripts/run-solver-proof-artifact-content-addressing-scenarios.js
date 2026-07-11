#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {runTestFileSync} from './run-test-files.js';
import {validateProofArtifactMigration} from
  './solve/proof-artifact-migration.js';

const SCENARIO = 'solver-proof-artifact-content-addressing';
const GUARD_TESTS = Object.freeze([
  'test/solve/content-addressed-change-artifact.test.js',
  'test/solve/step-auto-diff.test.js',
  'test/solve/evidence.test.js',
]);
const REPORT_DIR = 'test-output/reports';
const TEST_TIMEOUT_MS = 300000;
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';

const guards = GUARD_TESTS.map((file) => ({
  file,
  result: runTestFileSync(file, {
    print: false,
    timeoutMs: TEST_TIMEOUT_MS,
  }),
}));
const migration = validateProofArtifactMigration(process.cwd());
const total = guards.length + 1;
const passedChecks = guards.filter((guard) => guard.result.ok).length +
  (migration.valid ? 1 : 0);
const failed = total - passedChecks;
const passed = failed === 0;
const timestamp = new Date().toISOString();
const report = {
  timestamp,
  scenario: SCENARIO,
  producer: 'solver-proof-artifact-content-addressing',
  fidelity: 'deterministic-guard',
  summary: {total, passed: passedChecks, failed},
  optimizationSummary: {totalPriorityItems: failed},
  standardSummary: {
    scenarios: [{
      scenario: SCENARIO,
      passed,
      current: {passed, verdict: passed ? 'PASS' : 'FAIL'},
      detail: {
        guardTests: guards.map((guard) => ({
          file: guard.file,
          passed: guard.result.ok,
          assertions: guard.result.assertions,
        })),
        migration: migration.valid ? migration.receipt : null,
        problems: migration.problems,
      },
    }],
  },
};
fs.mkdirSync(REPORT_DIR, {recursive: true});
const stamp = timestamp.replace(/[:.]/gu, '-');
const reportPath = path.join(REPORT_DIR, `${SCENARIO}-${stamp}.report.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `${SCENARIO}: ${passed ? VERDICT_PASS : VERDICT_FAIL} — ` +
  `${passedChecks}/${total} checks green\nreport: ${reportPath}\n`,
);
process.exitCode = passed ? 0 : 1;
