#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const GUARD_TESTS = Object.freeze([
  'test/solve/global-owner-debt-inventory.test.js',
]);

runGuardTestScenarios({
  'global-owner-debt-inventory': GUARD_TESTS,
  'global-owner-debt-inventory-migration': GUARD_TESTS,
});
