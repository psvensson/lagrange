#!/usr/bin/env node

import {fileURLToPath} from 'node:url';

import {runGuardTestScenarios} from
  '../../scripts/checks/guard-test-scenario-runner.js';

const REQUEST_CELL_PLACEMENT_SCENARIO =
  'minimal-deployment-request-cell-placement';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/control-plane/request-binding-service-definition-owner.test.js',
  'test/bootstrap/runtime-service-rebalancer-owner.test.js',
  'test/rebalancer/formation-runtime-service-create-lane-budget-starvation.test.js',
  'test/rebalancer/runtime-service-entity.test.js',
  'test/function/change-binding-compilation.test.js',
  'test/wasm-service/time-binding-compilation.test.js',
  'test/wasm-service/once-binding-compilation.test.js',
  'test/service/minimal-deployment-request-binding-compilation-owner-guard.test.js',
]);

function runRequestCellPlacementScenario() {
  runGuardTestScenarios({
    [REQUEST_CELL_PLACEMENT_SCENARIO]: TEST_FILES,
  }, {reportDir: REPORT_DIR});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRequestCellPlacementScenario();
}

export {
  REQUEST_CELL_PLACEMENT_SCENARIO,
};
