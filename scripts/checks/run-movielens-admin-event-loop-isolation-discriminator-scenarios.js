#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'movielens-admin-event-loop-isolation-discriminator';
const GUARD_TESTS = [
  'test/convergence/dt-admin-event-loop-isolation-discriminator.test.js',
];

runGuardTestScenarios({
  [SCENARIO]: Object.freeze(GUARD_TESTS),
});
