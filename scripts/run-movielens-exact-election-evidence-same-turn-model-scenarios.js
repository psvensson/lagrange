#!/usr/bin/env node
/**
 * Deterministic scenario-harness adapter for the focused exact-election
 * evidence owner-composition TLC route and its two declared mutants.
 */

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'movielens-exact-election-evidence-same-turn-model': Object.freeze([
    'test/scripts/exact-election-evidence-same-turn-model-contract.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
