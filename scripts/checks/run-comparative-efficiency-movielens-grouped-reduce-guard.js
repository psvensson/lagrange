#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'comparative-efficiency-movielens-grouped-reduce-guard': [
    'test/distributed/harness/__tests__/' +
      'comparative-efficiency-movielens-grouped-reduce.test.js',
    'test/examples/' +
      'comparative-efficiency-movielens-public-request-workload.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
