#!/usr/bin/env node
/**
 * Deterministic guard for serialized priority-REPLACE spread non-regression.
 *
 * The pure projection pins the safety/target distinction and the owner-path
 * suite proves the existing current/projected voter-ready row data reaches it.
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'movielens-incremental-replace-spread-nonregression': [
    'test/rebalancer/operation-workflow-remove-safety-quorum-predicate.test.js',
    'test/rebalancer/priority-remove-safety-spread-nonregression.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
