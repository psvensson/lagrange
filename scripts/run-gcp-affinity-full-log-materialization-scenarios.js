#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';

const SCENARIO = 'gcp-affinity-full-log-materialization-v2';
const REPORT_DIRECTORY = 'test-output/reports';
const GUARD_FILE = 'test/runtime/movielens-affinity-demo-wiring.test.js';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const guard = runTestFileSync(GUARD_FILE, {
    print: false,
    timeoutMs: 300000,
  });
  const passed = guard.ok === true;
  const timestamp = new Date().toISOString();
  const verdict = passed ? VERDICT_PASS : VERDICT_FAIL;
  const report = {
    timestamp,
    scenario: SCENARIO,
    producer: 'gcp-affinity-full-log-materialization-proof',
    fidelity: 'deterministic-real-teardown-seam',
    summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
    optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
        passed,
        current: {
          passed,
          verdict,
          verdictReason: passed ? null : 'deterministic_guard_failed',
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
      }],
    },
  };
  const reportDir = path.join(root, REPORT_DIRECTORY);
  fs.mkdirSync(reportDir, {recursive: true});
  const stamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(
    reportDir,
    `${SCENARIO}-${stamp}.report.json`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
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
