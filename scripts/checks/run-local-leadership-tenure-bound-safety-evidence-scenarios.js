#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'local-leadership-tenure-bound-safety-evidence';
const GUARD_TESTS = [
  'test/convergence/dt-local-leader-seed-safety-merge.test.js',
];
const REPORT_DIR =
  'test-output/reports/local-leadership-tenure-bound-safety-evidence';

runGuardTestScenarios({
  [SCENARIO]: Object.freeze(GUARD_TESTS),
}, {reportDir: REPORT_DIR});
