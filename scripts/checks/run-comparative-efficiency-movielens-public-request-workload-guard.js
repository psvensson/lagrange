#!/usr/bin/env node

import {
  runGuardTestScenarios,
} from './guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'comparative-efficiency-movielens-public-request-workload-guard': [
    'test/examples/' +
      'comparative-efficiency-movielens-public-request-workload.test.js',
    'test/runtime/request-cell-table-read-index.test.js',
    'test/runtime/movielens-public-request-component-validation.test.js',
    'test/examples/minimal-deployment-request-binding-example.test.js',
    'test/examples/movielens-public-request-evidence-artifacts.test.js',
  ],
});

runGuardTestScenarios(SCENARIOS);
