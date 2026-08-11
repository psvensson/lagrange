#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const REGISTRY_WITNESS_TESTS = [
  'test/control-plane/priority-services-row-publication-census-contract.test.js',
  'test/scripts/impact-contract-registry.test.js',
];
const SCENARIOS = {
  'coupled-pair-registry-witness-foundation': REGISTRY_WITNESS_TESTS,
  'coupled-pair-registry-witness-domain-closure': REGISTRY_WITNESS_TESTS,
};

runGuardTestScenarios(SCENARIOS);
