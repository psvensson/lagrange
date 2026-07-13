/**
 * Shared machinery for quest scenario runner scripts that prove a
 * scenario by running its committed deterministic guard-test files.
 *
 * Each runner declares a `{scenario: [guardTestFile, ...]}` map and calls
 * `runGuardTestScenarios(SCENARIOS)`. Every scenario's guard files are
 * executed via the fail-closed test runner and a scenario-harness report is written into
 * `test-output/reports/` in the shape the Solver's `scenario-harness`
 * probe reads (`scripts/solve/probes/scenario-harness.js`):
 *   - standardSummary.scenarios[].current.passed / verdict
 *   - optimizationSummary.totalPriorityItems (lower-is-better gradient =
 *     number of failing guard-test files)
 *   - summary.failed
 *
 * Deterministic and fast (no Docker); safe to run N times for a
 * doneWhen's `consecutive` gate.
 */

import fs from 'node:fs';
import path from 'node:path';
import {runTestFileSync} from '../run-test-files.js';

const REPORT_DIR = 'test-output/reports';
const GUARD_FILE_TIMEOUT_MS = 300000;

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

function buildReport(scenario, results, timestamp) {
  const failing = results.filter((r) => !r.passed);
  const passed = failing.length === 0;
  return {
    timestamp,
    scenario,
    // Closure-fidelity stamp: the Solver audit distinguishes deterministic
    // guard evidence from live-run evidence when weighing a MEASURED
    // closure (a green DT proves test-code binding, not live binding).
    producer: 'guard-test-scenario-runner',
    fidelity: 'deterministic-guard',
    summary: {
      total: results.length,
      passed: results.length - failing.length,
      failed: failing.length,
    },
    optimizationSummary: {
      totalPriorityItems: failing.length,
    },
    standardSummary: {
      scenarios: [
        {
          scenario,
          passed,
          current: {
            passed,
            verdict: passed ? 'PASS' : 'FAIL',
          },
          detail: {
            guardTests: results,
          },
        },
      ],
    },
  };
}

function runScenario(scenarios, scenario, reportDir) {
  const files = scenarios[scenario];
  const results = files.map(runGuardFile);
  const timestamp = new Date().toISOString();
  const report = buildReport(scenario, results, timestamp);

  fs.mkdirSync(reportDir, {recursive: true});
  const fileStamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(
    reportDir,
    `${scenario}-${fileStamp}.report.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const passed = report.summary.failed === 0;
  process.stdout.write(
    `${scenario}: ${passed ? 'PASS' : 'FAIL'} — ` +
    `${report.summary.passed}/${report.summary.total} guard files green ` +
    `(${results.map((r) => `${path.basename(r.file)}=` +
      `${r.assertionsPassed ?? '?'}/${r.assertions ?? '?'}`).join(' ')})\n` +
    `report: ${reportPath}\n`,
  );
  return passed;
}

/**
 * Run the named scenario (argv[2]) or every scenario in the map, and set
 * the process exit code (0 all pass, 1 any fail, 2 unknown scenario).
 * @param {Object<string, string[]>} scenarios - scenario -> guard files.
 * @param {Object} options - optional reportDir override for isolated evidence.
 */
function runGuardTestScenarios(scenarios, options = {}) {
  const reportDir = options.reportDir || REPORT_DIR;
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(scenarios);
  for (const name of names) {
    if (!scenarios[name]) {
      process.stderr.write(`unknown scenario: ${name}\n`);
      process.exitCode = 2;
      return;
    }
  }
  let allPassed = true;
  for (const name of names) {
    if (!runScenario(scenarios, name, reportDir)) allPassed = false;
  }
  process.exitCode = allPassed ? 0 : 1;
}

export {runGuardTestScenarios};
