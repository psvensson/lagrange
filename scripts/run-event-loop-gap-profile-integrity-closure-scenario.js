#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';

const SCENARIO = 'event-loop-gap-profile-integrity-closure';
const TEST_FILE = 'test/diagnostics/event-loop-gap-watchdog.test.js';
const REPORT_DIRECTORY = 'test-output/reports';
const TEST_TIMEOUT_MS = 300000;
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const guard = runTestFileSync(TEST_FILE, {
    print: false,
    timeoutMs: TEST_TIMEOUT_MS,
  });
  const passed = guard.ok === true;
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    scenario: SCENARIO,
    producer: 'event-loop-gap-profile-integrity-closure-proof',
    fidelity: 'deterministic-guard',
    summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
    optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
        passed,
        current: {
          passed,
          verdict: passed ? VERDICT_PASS : VERDICT_FAIL,
          verdictReason: passed ? 'deterministic_guard_passed' :
            'deterministic_guard_failed',
        },
        detail: {
          file: TEST_FILE,
          assertions: guard.assertions,
          elapsedMs: guard.elapsedMs,
          reasons: guard.reasons,
          output: guard.output,
        },
      }],
    },
  };
  const reportDir = path.join(root, REPORT_DIRECTORY);
  fs.mkdirSync(reportDir, {recursive: true});
  const stamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `${SCENARIO}-${stamp}.report.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${passed ? VERDICT_PASS : VERDICT_FAIL} deterministic guard\n` +
    `report: ${path.relative(root, reportPath)}\n`,
  );
  process.exitCode = passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {main};
