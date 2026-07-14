#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-installation-reconciler';
const REPORT_DIR = 'test-output/reports/service-installation-reconciler';
const TEST_FILES = Object.freeze([
  'test/service/service-installation-reconciler.test.js',
  'test/bootstrap/shared/service-installation-reconciler-setup.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
