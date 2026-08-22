#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIO = 'selective-verification-single-owner';
const GUARDS = Object.freeze([
  'test/scripts/changed-paths.test.js',
  'test/scripts/impact-contract-registry.test.js',
  'test/scripts/select-change-tests.test.js',
  'test/scripts/change-proof-boundary.test.js',
  'test/scripts/verification-policy.test.js',
  'test/scripts/verification-receipt.test.js',
  'test/scripts/publish-head.test.js',
  'test/scripts/acceptance-proof-manifest-runner.test.js',
  'test/release/project-hardening-contracts.test.js',
]);

runGuardTestScenarios({[SCENARIO]: GUARDS}, {
  fidelity: 'real-selector-boundary-receipt-hook-and-release-seams',
});
