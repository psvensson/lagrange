#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'transaction-owned-commit-mode-cutover': [
    'test/query/distributed-transaction-coordinator.test.js',
    'test/query/distributed-transaction-coordinator.property.test.js',
    'test/query/sql-query-engine-transaction-owned-commit-mode.test.js',
    'test/query/sql-query-engine-distributed-transactions.test.js',
    'test/query/transaction-owned-commit-mode-guard.test.js',
    'test/partition/partition-service.test.js',
    'test/partition/partition-transaction.property.test.js',
    'test/rebalancer/rebalance-coordinator-atomic-transitions.test.js',
    'test/cdc/cdc-integration-service-mutations-and-epoch.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
