#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const REGISTRY_WITNESS_TESTS = [
  'test/control-plane/priority-services-row-publication-census-contract.test.js',
  'test/scripts/impact-contract-registry.test.js',
];
const PROOF_CONE_SELECTION_TESTS = [
  'test/scripts/impact-proof-cone.test.js',
  'test/scripts/impact-proof-cone-policy.test.js',
  'test/scripts/impact-proof-cone-receipt.test.js',
  'test/scripts/impact-proof-cone-producer.test.js',
  'test/scripts/impact-proof-cone-followed-file-races.test.js',
  'test/scripts/impact-proof-cone-consumers.test.js',
];
const PROOF_CONE_INPUT_INTEGRITY_TESTS = [
  ...PROOF_CONE_SELECTION_TESTS,
];
const SCENARIOS = {
  'coupled-pair-registry-witness-foundation': REGISTRY_WITNESS_TESTS,
  'coupled-pair-registry-witness-domain-closure': REGISTRY_WITNESS_TESTS,
  'coupled-pair-proof-cone-selection': PROOF_CONE_SELECTION_TESTS,
  'coupled-pair-proof-cone-input-integrity-closure':
    PROOF_CONE_INPUT_INTEGRITY_TESTS,
};

runGuardTestScenarios(SCENARIOS);
