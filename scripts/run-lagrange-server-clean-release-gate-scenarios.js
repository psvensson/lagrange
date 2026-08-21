#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'lagrange-server-clean-release-gate';
const SCENARIO_FIDELITY = 'clean-checkout-release-gate';
const SCENARIO_REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/scripts/run-test-ci.test.js',
  'test/solve/global-owner-debt-inventory.test.js',
  'test/integration/lagrange-server-npm-package.integration.test.js',
  'test/scripts/release-npm-package.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {
  fidelity: SCENARIO_FIDELITY,
  reportDir: SCENARIO_REPORT_DIR,
});
