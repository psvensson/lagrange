#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'benchmark-statistical-capacity-protocol-guard': [
    'test/distributed/harness/__tests__/' +
      'benchmark-statistical-capacity-protocol.test.js',
    'test/distributed/harness/__tests__/' +
      'benchmark-statistical-capacity-protocol-adversarial.test.js',
    'test/distributed/harness/__tests__/' +
      'benchmark-statistical-capacity-live-evidence.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
