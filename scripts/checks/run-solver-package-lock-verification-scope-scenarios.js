#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'solver-package-lock-verification-scope';
const REPORT_DIR = 'test-output/reports/solver-package-lock-verification-scope';
const TEST_FILES = Object.freeze([
  'test/solve/package-lock-verification-scope.test.js',
  'test/solve/verification-handoff.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
