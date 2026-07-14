#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-install-lifecycle-cli';
const REPORT_DIR = 'test-output/reports/service-install-lifecycle-cli';
const TEST_FILES = Object.freeze([
  'test/cli/service-install-lifecycle-cli.test.js',
  'test/integration/service-install-lifecycle-cli-pgwire.integration.test.js',
  'test/cli/service-init-scaffold.test.js',
  'test/packaging/sea-bundle-smoke.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
