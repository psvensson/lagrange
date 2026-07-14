#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-lifecycle-command-catalog-composition';
const REPORT_DIR =
  'test-output/reports/service-lifecycle-command-catalog-composition';
const TEST_FILES = Object.freeze([
  'test/service/service-lifecycle-command-owner.test.js',
  'test/bootstrap/shared/control-plane-setup.test.js',
  'test/control-plane/service-install-catalog-owner.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
