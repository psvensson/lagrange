#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const CENSUS_GUARD_FILES = Object.freeze([
  'test/control-plane/priority-partition-census-self-diagnosis.test.js',
  'test/control-plane/priority-partition-census-self-diagnosis-adversarial.test.js',
]);
const ADAPTER_CENSUS_GUARD_FILES = Object.freeze([
  ...CENSUS_GUARD_FILES,
  'test/admin/admin-control-snapshot-current-priority-placement.test.js',
]);
const SCENARIOS = Object.freeze({
  'priority-partition-census-adapter-authority-closure':
    ADAPTER_CENSUS_GUARD_FILES,
  'priority-partition-census-artifact-identity-closure':
    ADAPTER_CENSUS_GUARD_FILES,
  'priority-partition-census-authority-canonicalization': CENSUS_GUARD_FILES,
  'priority-partition-census-canonical-record-closure': CENSUS_GUARD_FILES,
  'priority-partition-census-self-diagnosis': CENSUS_GUARD_FILES,
});

runGuardTestScenarios(SCENARIOS);
