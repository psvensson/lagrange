#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const GUARD_TESTS = Object.freeze([
  'test/control-plane/publication-recovery-normalization-authority.test.js',
]);

runGuardTestScenarios({
  'priority-recovery-control-plane-normalize-distinct-string-array-authority':
    GUARD_TESTS,
});
