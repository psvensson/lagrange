#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'comparative-efficiency-request-enrichment-guard': [
    'test/distributed/harness/__tests__/' +
      'comparative-efficiency-request-enrichment.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
