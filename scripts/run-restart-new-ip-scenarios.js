#!/usr/bin/env node
/**
 * Runner for the two `restart-new-ip-*` quest scenarios.
 *
 * Executes each scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) via tap and writes a scenario-harness report into
 * `test-output/reports/` in the shape the Solver's `scenario-harness` probe
 * reads (`scripts/solve/probes/scenario-harness.js`):
 *   - standardSummary.scenarios[].current.passed / verdict
 *   - optimizationSummary.totalPriorityItems (lower-is-better gradient =
 *     number of failing guard-test files)
 *   - summary.failed
 *
 * Scenario -> guard tests:
 *   restart-new-ip-name-first-advertising
 *     - test/transport/node-address-resolution.test.js
 *       (explicit advertised hostname preserved under wildcard bind; stale
 *        bootstrap seed loses to the fresher canonical node_endpoints row)
 *   restart-new-ip-peer-reconnect-unwedge
 *     - test/transport/message-router-endpoint-address-change-redial.test.js
 *       (defect 1: node_endpoints address change triggers close+redial;
 *        defect 2: keepalive pong deadline severs stale-but-open connections)
 *     - test/bootstrap/mesh-reconcile-terminal-revive.test.js
 *       (defect 1: mesh reconcile revives terminal connections on a new address)
 *     - test/transport/node-address-resolution.test.js
 *       (defect 3: stale seedNodeWsAddress vs canonical row precedence)
 *
 * Deterministic and fast (no Docker); safe to run N times for the doneWhen's
 * `consecutive: 3` gate.
 *
 * Usage: node scripts/run-restart-new-ip-scenarios.js [scenario]
 *   (default: run both scenarios)
 */

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const REPORT_DIR = 'test-output/reports';

const SCENARIOS = {
  'restart-new-ip-name-first-advertising': [
    'test/transport/node-address-resolution.test.js',
  ],
  'restart-new-ip-peer-reconnect-unwedge': [
    'test/transport/message-router-endpoint-address-change-redial.test.js',
    'test/bootstrap/mesh-reconcile-terminal-revive.test.js',
    'test/transport/node-address-resolution.test.js',
  ],
};

function runGuardFile(file) {
  const result = spawnSync('npx', ['tap', file, '--disable-coverage'], {
    encoding: 'utf8',
    timeout: 300000,
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  const totals = out.match(/# \{ total: (\d+), pass: (\d+) \}/);
  return {
    file,
    passed: result.status === 0,
    assertions: totals ? Number(totals[1]) : null,
    assertionsPassed: totals ? Number(totals[2]) : null,
  };
}

function buildReport(scenario, results, timestamp) {
  const failing = results.filter((r) => !r.passed);
  const passed = failing.length === 0;
  return {
    timestamp,
    scenario,
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

function runScenario(scenario) {
  const files = SCENARIOS[scenario];
  const results = files.map(runGuardFile);
  const timestamp = new Date().toISOString();
  const report = buildReport(scenario, results, timestamp);

  fs.mkdirSync(REPORT_DIR, {recursive: true});
  const fileStamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `${scenario}-${fileStamp}.report.json`);
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

function main() {
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(SCENARIOS);
  for (const name of names) {
    if (!SCENARIOS[name]) {
      process.stderr.write(`unknown scenario: ${name}\n`);
      process.exitCode = 2;
      return;
    }
  }
  let allPassed = true;
  for (const name of names) {
    if (!runScenario(name)) allPassed = false;
  }
  process.exitCode = allPassed ? 0 : 1;
}

main();
