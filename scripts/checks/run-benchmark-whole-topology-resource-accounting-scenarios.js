#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'benchmark-whole-topology-resource-accounting-guard': [
    'test/distributed/harness/__tests__/' +
      'benchmark-whole-topology-resource-accounting.test.js',
    'test/distributed/harness/__tests__/' +
      'benchmark-whole-topology-resource-accounting-adversarial.test.js',
    'test/distributed/harness/__tests__/' +
      'benchmark-resource-live-observation-authority.test.js',
    'test/distributed/harness/__tests__/docker-provider.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
