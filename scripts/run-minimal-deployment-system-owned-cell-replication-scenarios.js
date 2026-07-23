#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-system-owned-cell-replication';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/service/external-service-manifest.test.js',
  'test/control-plane/deployment-binding-owner.test.js',
  'test/query/service-lifecycle-sql-control-surface.test.js',
  'test/control-plane/request-binding-service-definition-owner.test.js',
  'test/service/minimal-deployment-request-binding-compilation-owner-guard.test.js',
  'test/rebalancer/runtime-service-entity.test.js',
  'test/rebalancer/runtime-service-affinity-policy-lift.test.js',
  'test/rebalancer/formation-runtime-service-create-lane-budget-starvation.test.js',
  'test/admin/admin-runtime-service-views.test.js',
  'test/cli/core/remote-cache.test.js',
  'test/runtime/service-discovery-catalog.test.js',
  'test/function/change-binding-compilation.test.js',
  'test/wasm-service/time-binding-compilation.test.js',
  'test/wasm-service/once-binding-compilation.test.js',
  'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
  'test/service/minimal-deployment-request-cell-routing.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
