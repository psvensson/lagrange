#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'comparative-efficiency-postgresql-comparator-reuse': Object.freeze([
    'test/distributed/harness/__tests__/' +
      'benchmark-capacity-reusable-comparator.test.js',
    'test/distributed/harness/__tests__/' +
      'movielens-postgresql-comparator-isolation.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
