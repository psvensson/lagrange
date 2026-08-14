#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'admin-ws-client-open-timeout';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/runtime/movielens-three-way-affinity-demo.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
