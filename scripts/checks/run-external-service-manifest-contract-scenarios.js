#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'external-service-manifest-contract';
const REPORT_DIR = 'test-output/reports/external-service-manifest-contract';
const TEST_FILES = Object.freeze([
  'test/service/external-service-manifest.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
