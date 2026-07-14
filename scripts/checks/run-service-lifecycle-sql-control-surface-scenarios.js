#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-lifecycle-sql-control-surface';
const REPORT_DIR =
  'test-output/reports/service-lifecycle-sql-control-surface';
const TEST_FILES = Object.freeze([
  'test/query/service-lifecycle-sql-control-surface.test.js',
  'test/query/sql-request.test.js',
  'test/runtime/pgwire-runtime-module.test.js',
  'test/bootstrap/shared/control-plane-setup.test.js',
  'test/control-plane/service-install-catalog-owner.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
