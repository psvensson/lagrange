#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const C4_GUARDS = Object.freeze([
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-measured-cell-admission.test.js',
  'test/distributed/harness/__tests__/' +
    'benchmark-whole-topology-resource-accounting-adversarial.test.js',
]);
const C10_GUARDS = Object.freeze([
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-claim-projection.test.js',
]);

const SCENARIOS = Object.freeze({
  'comparative-efficiency-measured-cell-validation': C4_GUARDS,
  'comparative-efficiency-measured-cell-projection-binding': C10_GUARDS,
  'comparative-efficiency-measured-cell-admission': Object.freeze([
    ...C4_GUARDS,
    ...C10_GUARDS,
  ]),
});

runGuardTestScenarios(SCENARIOS);
