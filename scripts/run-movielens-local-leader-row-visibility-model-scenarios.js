#!/usr/bin/env node
/**
 * Deterministic scenario-harness adapter for the focused local leader-row TLC
 * route and its declared failure mutants.
 */

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'movielens-local-leader-row-visibility-model': Object.freeze([
    'test/scripts/local-leader-row-visibility-model-contract.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
