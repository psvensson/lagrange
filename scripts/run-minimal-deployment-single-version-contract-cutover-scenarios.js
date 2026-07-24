#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-single-version-contract-cutover';
const TEST_FILES = Object.freeze([
  'test/service/minimal-deployment-single-contract-owner-guard.test.js',
  'test/service/minimal-deployment-artifact-owner-guard.test.js',
  'test/service/external-service-manifest.test.js',
  'test/cli/service-init-scaffold.test.js',
  'test/control-plane/service-install-catalog-owner.test.js',
  'test/control-plane/deployment-binding-owner.test.js',
  'test/control-plane/request-binding-service-definition-owner.test.js',
  'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
  'test/service/minimal-deployment-request-cell-routing.test.js',
  'test/rebalancer/' +
    'formation-runtime-service-create-lane-budget-starvation.test.js',
  'test/function/change-binding-compilation.test.js',
  'test/wasm-service/time-binding-compilation.test.js',
  'test/wasm-service/once-binding-compilation.test.js',
  'test/service/service-lifecycle-command-owner.test.js',
  'test/query/service-lifecycle-sql-control-surface.test.js',
  'test/integration/service-install-lifecycle-cli-pgwire.integration.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {
  fidelity: 'production-path-in-process',
  reportDir: 'test-output/reports',
});
