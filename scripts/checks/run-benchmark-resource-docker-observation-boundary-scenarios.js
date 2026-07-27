#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'benchmark-resource-docker-observation-boundary': [
    'test/distributed/harness/__tests__/docker-provider.test.js',
    'test/distributed/harness/__tests__/cluster-start-node-lifecycle.test.js',
    'test/distributed/harness/__tests__/cluster-stop-load-config-readiness.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
