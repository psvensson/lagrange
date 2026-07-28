#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'comparative-efficiency-negative-controls-guard': [
    'test/distributed/harness/__tests__/' +
      'comparative-efficiency-negative-controls.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
