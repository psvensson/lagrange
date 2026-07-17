#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'movielens-ledger-completion-continuity-discriminator';
const GUARD_TESTS = [
  'test/convergence/dt-ledger-completion-continuity-discriminator.test.js',
];

runGuardTestScenarios({
  [SCENARIO]: Object.freeze(GUARD_TESTS),
});
