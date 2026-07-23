#!/usr/bin/env node

import {fileURLToPath} from 'node:url';

import {runGuardTestScenarios} from
  '../../scripts/checks/guard-test-scenario-runner.js';

const REQUEST_CELL_RUNTIME_READINESS_SCENARIO =
  'minimal-deployment-request-cell-runtime-readiness';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/bootstrap/shared/control-plane-setup.test.js',
  'test/packaging/sea-bundle-smoke.test.js',
  'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
  'test/runtime/runtime-startup-wiring.test.js',
  'test/runtime/wasm-component-driver.test.js',
  'test/runtime/service-runtime-lifecycle-idempotency.test.js',
  'test/service/installable-service-artifact-resolver.test.js',
]);

function runRequestCellRuntimeReadinessScenario() {
  runGuardTestScenarios({
    [REQUEST_CELL_RUNTIME_READINESS_SCENARIO]: TEST_FILES,
  }, {reportDir: REPORT_DIR});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRequestCellRuntimeReadinessScenario();
}

export {
  REQUEST_CELL_RUNTIME_READINESS_SCENARIO,
};
