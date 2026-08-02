#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'rolling-restart-acknowledged-write-durability-visibility': [
    'test/partition/partition-write-kernel.test.js',
    'test/partition/partition-service-write-commit.test.js',
    'test/query/query-executor-durable-commit-witness.test.js',
    'test/admin/admin-query-result-message-envelope.test.js',
    'test/distributed/harness/__tests__/load-generator.test.js',
    'test/distributed/harness/rolling-restart-acknowledged-write-durability-visibility.test.js',
    'test/distributed/harness/__tests__/acknowledged-write-visibility-retry.test.js',
    'test/distributed/harness/__tests__/rolling-restart-scenario.test.js',
    'test/scripts/rolling-restart-stat-gate-summary.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
