#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

runGuardTestScenarios({
  'solver-scope-pressure-precommit-enforcement': [
    'test/solve/scope-pressure-precommit-enforcement.test.js',
    'test/solve/convergence-guards.test.js',
  ],
});
