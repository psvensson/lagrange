#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-init-scaffold';
const REPORT_DIR = 'test-output/reports/service-init-scaffold';
const TEST_FILES = Object.freeze([
  'test/cli/service-init-scaffold.test.js',
  'test/packaging/sea-bundle-smoke.test.js',
  'test/packaging/service-cli-pg-runtime-dependency.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
