#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-artifact-binding-identity';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/control-plane/service-install-catalog-owner.test.js',
  'test/query/service-lifecycle-sql-control-surface.test.js',
  'test/service/minimal-deployment-artifact-binding-identity-owner-guard.test.js',
  'test/service/minimal-deployment-artifact-owner-guard.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
