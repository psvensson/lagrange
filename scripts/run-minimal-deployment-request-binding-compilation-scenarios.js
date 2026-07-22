#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-request-binding-compilation';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/control-plane/request-binding-service-definition-owner.test.js',
  'test/bootstrap/runtime-service-rebalancer-owner.test.js',
  'test/control-plane/system-metadata-owner-modules.test.js',
  'test/wasm-service/wasm-service-models.test.js',
  'test/wasm-service/backward-compat-serialization.test.js',
  'test/wasm-service/meta-command-handlers.test.js',
  'test/service/minimal-deployment-request-binding-compilation-owner-guard.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
