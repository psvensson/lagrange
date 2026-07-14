#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'installable-service-artifact-owner';
const REPORT_DIR = 'test-output/reports/installable-service-artifact-owner';
const TEST_FILES = Object.freeze([
  'test/service/installable-service-artifact-resolver.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
