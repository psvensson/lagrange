#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'comparative-efficiency-claim-projection-guard': [
    'test/distributed/harness/__tests__/' +
      'comparative-efficiency-claim-projection.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
