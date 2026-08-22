#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const REGISTRY_WITNESS_TESTS = [
  'test/control-plane/priority-services-row-publication-census-contract.test.js',
  'test/scripts/impact-contract-registry.test.js',
];
const CHANGE_SELECTION_TESTS = [
  'test/scripts/changed-paths.test.js',
  'test/scripts/impact-contract-registry.test.js',
  'test/scripts/select-change-tests.test.js',
  'test/scripts/change-proof-boundary.test.js',
];
const CHANGE_SELECTION_INPUT_INTEGRITY_TESTS = [
  ...CHANGE_SELECTION_TESTS,
];
const SOLVER_LANDING_TESTS = [
  'test/solve/coupled-pair-landing-guard.test.js',
  'test/solve/coupled-pair-review-binding.test.js',
];
const SCENARIOS = {
  'coupled-pair-registry-witness-foundation': REGISTRY_WITNESS_TESTS,
  'coupled-pair-registry-witness-domain-closure': REGISTRY_WITNESS_TESTS,
  'coupled-pair-proof-cone-selection': CHANGE_SELECTION_TESTS,
  'coupled-pair-proof-cone-input-integrity-closure':
    CHANGE_SELECTION_INPUT_INTEGRITY_TESTS,
  'coupled-pair-solver-landing-enforcement': SOLVER_LANDING_TESTS,
  'coupled-pair-landing-guard': SOLVER_LANDING_TESTS,
};

runGuardTestScenarios(SCENARIOS);
