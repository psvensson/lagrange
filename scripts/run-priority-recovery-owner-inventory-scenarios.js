#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const GUARD_TESTS = Object.freeze([
  'test/solve/priority-recovery-owner-inventory.test.js',
]);

runGuardTestScenarios({
  'priority-recovery-owner-inventory': GUARD_TESTS,
});
