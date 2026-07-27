#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'benchmark-semantic-parity': [
    'test/distributed/harness/__tests__/benchmark-semantic-parity.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
