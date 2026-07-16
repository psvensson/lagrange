#!/usr/bin/env node
/**
 * Deterministic guard runner for the explicit REPLACE bootstrap cohort
 * authority Quest.
 *
 * The ReplicaHandler suite contains the exact stale-cache counterexample and
 * its adjacent no-hint, ADD, retry, and topology-safety controls. The shared
 * runner writes the measured scenario-harness evidence consumed by Solver.
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'movielens-replace-bootstrap-cohort-authority': [
    'test/node/replica-handler.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
