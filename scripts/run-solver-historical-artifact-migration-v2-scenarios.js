#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {runTestFileSync} from './run-test-files.js';
import {validateHistoricalMigrationV2Manifest} from
  './solve/historical-artifact-migration-v2.js';
import {historicalArtifactRootDigest} from
  './solve/historical-artifact-root-digest.js';

const DEFAULT_SCENARIO = 'solver-historical-artifact-migration-v2';
const SCENARIO = process.argv[2] || DEFAULT_SCENARIO;
const GUARD_TEST = 'test/solve/historical-artifact-migration-v2.test.js';
const REPORT_DIR = 'test-output/reports';
const TEST_TIMEOUT_MS = 300000;
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const HISTORICAL_WRITE_PROBLEM = 'historical-root-write';
const REPORT_FIDELITY = 'deterministic-guard';

const before = historicalArtifactRootDigest();
const guard = runTestFileSync(GUARD_TEST, {
  print: false,
  timeoutMs: TEST_TIMEOUT_MS,
});
const validation = validateHistoricalMigrationV2Manifest(process.cwd());
const problems = [...validation.problems];
if (historicalArtifactRootDigest() !== before) {
  problems.push(HISTORICAL_WRITE_PROBLEM);
}
const total = 3;
const passedChecks = (guard.ok ? 1 : 0) +
  (validation.valid ? 1 : 0) +
  (problems.includes(HISTORICAL_WRITE_PROBLEM) ? 0 : 1);
const failed = total - passedChecks;
const passed = failed === 0;
const timestamp = new Date().toISOString();
const report = {
  timestamp,
  scenario: SCENARIO,
  producer: SCENARIO,
  fidelity: REPORT_FIDELITY,
  summary: {total, passed: passedChecks, failed},
  optimizationSummary: {totalPriorityItems: failed},
  standardSummary: {
    scenarios: [{
      scenario: SCENARIO,
      passed,
      current: {passed, verdict: passed ? VERDICT_PASS : VERDICT_FAIL},
      detail: {
        problems,
        guardTest: {
          file: GUARD_TEST,
          passed: guard.ok,
          assertions: guard.assertions,
        },
        batchInventorySha256:
          validation.manifest?.batchInventorySha256 || null,
        batchCount: validation.manifest?.batches?.length || 0,
        payloadCount: validation.manifest?.batches?.reduce((sum, batch) =>
          sum + batch.entries.length, 0) || 0,
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
  `${report.standardSummary.scenarios[0].detail.batchCount} batches, ` +
  `${report.standardSummary.scenarios[0].detail.payloadCount} payloads\n` +
  `report: ${reportPath}\n`,
);
process.exitCode = passed ? 0 : 1;
