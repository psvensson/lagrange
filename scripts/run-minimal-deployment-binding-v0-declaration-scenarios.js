#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-binding-v0-declaration';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/control-plane/deployment-binding-owner.test.js',
  'test/query/service-lifecycle-sql-control-surface.test.js',
  'test/runtime/pgwire-runtime-module.test.js',
  'test/cache/default-cache-sync-table-selection.test.js',
  'test/service/minimal-deployment-binding-v0-owner-guard.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
