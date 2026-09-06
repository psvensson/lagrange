#!/usr/bin/env node
/**
 * Runner for the `cdc-cache-delete-resurrection` repro scenario.
 *
 * Executes the deterministic apply-path harness
 * (`test/cache/cdc-cache-delete-resurrection-scenario.js`) and writes a
 * scenario-harness report into `test-output/reports/` in the shape the Solver's
 * `scenario-harness` probe reads (`scripts/solve/probes.js`):
 *   - standardSummary.scenarios[].current.passed / verdict
 *   - optimizationSummary.totalPriorityItems  (the lower-is-better gradient =
 *     number of non-converging (table, mode) cells)
 *   - summary.failed
 *
 * Deterministic and fast (no Docker, no timers); safe to run N times for the
 * doneWhen's `consecutive: 3` gate.
 *
 * Usage: node scripts/run-cdc-delete-resurrection-scenario.js
 */

import fs from 'node:fs';
import path from 'node:path';

import {LoggingService} from '../src/logging/logging-service.js';
import {ConfigurationManager} from '../src/config/configuration-manager.js';
import {
  runCdcDeleteResurrectionScenario,
} from '../test/cache/cdc-cache-delete-resurrection-scenario.js';

const SCENARIO = 'cdc-cache-delete-resurrection';
const REPORT_DIR = 'test-output/reports';

function initRuntimeSingletons() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'repro-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
}

function buildReport(result, timestamp) {
  const passed = result.passed;
  return {
    timestamp,
    scenario: SCENARIO,
    summary: {
      total: 1,
      passed: passed ? 1 : 0,
      failed: passed ? 0 : 1,
    },
    optimizationSummary: {
      totalPriorityItems: result.failingCells,
    },
    standardSummary: {
      scenarios: [
        {
          scenario: SCENARIO,
          passed,
          current: {
            passed,
            verdict: passed ? 'PASS' : 'FAIL',
          },
          detail: {
            totalCells: result.totalCells,
            failingCells: result.failingCells,
            byMode: result.byMode,
            failingTables: result.failingTables,
          },
        },
      ],
    },
  };
}

function main() {
  initRuntimeSingletons();
  const result = runCdcDeleteResurrectionScenario();
  const timestamp = new Date().toISOString();
  const report = buildReport(result, timestamp);

  fs.mkdirSync(REPORT_DIR, {recursive: true});
  const fileStamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(
    REPORT_DIR,
    `${SCENARIO}-${fileStamp}.report.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  process.stdout.write(
    `${SCENARIO}: ${result.passed ? 'PASS' : 'FAIL'} — ` +
    `${result.failingCells}/${result.totalCells} cells non-converging ` +
    `(reorder=${result.byMode.reorder} drop=${result.byMode.drop} ` +
    `tie=${result.byMode.tie})\n` +
    `report: ${reportPath}\n`,
  );

  process.exitCode = result.passed ? 0 : 1;
}

main();
