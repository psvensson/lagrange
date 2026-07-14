#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIO = 'service-portability-claims-contract';
const GUARD_TESTS = Object.freeze([
  'test/scripts/service-portability-claims-contract.test.js',
  'test/scripts/service-portability-static-gate.test.js',
]);
const REPORT_DIR = 'test-output/reports/service-portability-claims-contract';

runGuardTestScenarios({
  [SCENARIO]: GUARD_TESTS,
}, {
  reportDir: REPORT_DIR,
});
