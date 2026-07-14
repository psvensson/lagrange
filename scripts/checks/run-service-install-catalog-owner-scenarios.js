#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-install-catalog-owner';
const REPORT_DIR = 'test-output/reports/service-install-catalog-owner';
const TEST_FILES = Object.freeze([
  'test/control-plane/service-install-catalog-owner.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
