#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const DOCUMENTATION_ONBOARDING_GUARDS = Object.freeze([
  'test/scripts/check-doc-audience.test.js',
  'test/scripts/check-current-capabilities.test.js',
  'test/scripts/check-cli-docs.test.js',
  'test/scripts/service-portability-claims-contract.test.js',
  'test/scripts/service-portability-static-gate.test.js',
  'test/helm/lagrange-node-admin-default-deny.test.js',
]);
const SCENARIOS = Object.freeze({
  'documentation-audience-safe-onboarding': DOCUMENTATION_ONBOARDING_GUARDS,
});

runGuardTestScenarios(SCENARIOS);
