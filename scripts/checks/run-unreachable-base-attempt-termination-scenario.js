#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const UNREACHABLE_BASE_GUARDS = Object.freeze([
  'test/solve/unreachable-base-attempt-termination.test.js',
]);
const SCENARIOS = Object.freeze({
  // Successor id first; the original id stays mapped so its recorded evidence
  // remains interpretable by the scenario-harness probe.
  'solver-unreachable-base-attempt-termination-v2': UNREACHABLE_BASE_GUARDS,
  'solver-unreachable-base-attempt-termination': UNREACHABLE_BASE_GUARDS,
});

runGuardTestScenarios(SCENARIOS);
