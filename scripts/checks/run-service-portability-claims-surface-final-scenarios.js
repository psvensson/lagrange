#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-portability-claims-surface-final';
const GUARD_TESTS = Object.freeze([
  'test/scripts/service-portability-claims-contract.test.js',
  'test/distributed/harness/__tests__/examples-catalog-scenario.test.js',
  'test/scripts/examples-build-upload-run.test.js',
  'test/runtime/oci-container-driver.test.js',
  'test/query/callback-runtime-driver-registry.test.js',
]);
const REPORT_DIR =
  'test-output/reports/service-portability-claims-surface-final';

runGuardTestScenarios({
  [SCENARIO]: GUARD_TESTS,
}, {reportDir: REPORT_DIR});
