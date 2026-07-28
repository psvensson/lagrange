#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'comparative-efficiency-change-rate-crossover-guard': [
    'test/distributed/harness/__tests__/' +
      'comparative-efficiency-change-rate-crossover.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
