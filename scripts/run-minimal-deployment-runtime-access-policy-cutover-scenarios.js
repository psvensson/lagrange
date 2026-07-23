#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-runtime-access-policy-cutover';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/service/external-service-manifest.test.js',
  'test/control-plane/deployment-binding-owner.test.js',
  'test/control-plane/runtime-access-policy-owner.test.js',
  'test/cdc/cdc-integration-service-mutations-and-epoch.test.js',
  'test/query/runtime-access-policy-enforcement.test.js',
  'test/query/service-lifecycle-sql-control-surface.test.js',
  'test/query/service-partition-access-attribution.test.js',
  'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
  'test/service/minimal-deployment-request-cell-routing.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
