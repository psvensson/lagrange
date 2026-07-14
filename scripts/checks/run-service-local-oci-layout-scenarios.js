#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-local-oci-layout';
const REPORT_DIR = 'test-output/reports/service-local-oci-layout';
const TEST_FILES = Object.freeze([
  'test/service/service-local-oci-layout-builder.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
