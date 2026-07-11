#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const GUARD_TESTS = Object.freeze([
  'test/solve/scope-pressure-precommit-enforcement.test.js',
  'test/solve/convergence-guards.test.js',
]);

runGuardTestScenarios({
  'solver-scope-pressure-precommit-enforcement': GUARD_TESTS,
});
