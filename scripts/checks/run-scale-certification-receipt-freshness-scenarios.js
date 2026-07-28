#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'scale-certification-receipt-freshness': [
    'test/distributed/harness/__tests__/' +
      'scale-certification-receipt-freshness.test.js',
    'test/distributed/harness/__tests__/scale-evidence-contract.test.js',
    'test/distributed/harness/__tests__/' +
      'comparative-efficiency-evidence-contract.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
