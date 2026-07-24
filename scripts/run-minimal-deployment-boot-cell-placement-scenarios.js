#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-boot-cell-placement';
const FIDELITY = 'production-path-in-process';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/wasm-service/once-binding-compilation.test.js',
  'test/wasm-service/time-binding-compilation.test.js',
  'test/function/change-binding-compilation.test.js',
  'test/control-plane/request-binding-service-definition-owner.test.js',
  'test/bootstrap/runtime-service-rebalancer-owner.test.js',
  'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
  'test/service/minimal-deployment-request-binding-compilation-owner-guard.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {
  fidelity: FIDELITY,
  reportDir: REPORT_DIR,
});
