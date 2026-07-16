#!/usr/bin/env node
/**
 * Deterministic guard runner for MovieLens pre-schema spread admission.
 *
 * The runtime suite composes the authoritative admin snapshot's numeric
 * priority-partition summary with the pre-schema stability-window gate.
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'movielens-pre-schema-priority-spread-admission-authority': [
    'test/runtime/movielens-preload-admission-gate.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
