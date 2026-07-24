#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-runtime-access-policy-live-validation';
const TEST_FILES = Object.freeze([
  'test/service/external-service-manifest.test.js',
  'test/control-plane/service-install-catalog-owner.test.js',
  'test/bootstrap/shared/control-plane-setup.test.js',
  'test/integration/' +
    'minimal-deployment-runtime-access-policy-live-validation.' +
    'integration.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {
  fidelity: 'production-path-in-process',
  reportDir: 'test-output/reports',
});
