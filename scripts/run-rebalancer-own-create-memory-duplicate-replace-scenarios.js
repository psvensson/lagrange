#!/usr/bin/env node

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'rebalancer-own-create-memory-duplicate-replace': [
    'test/rebalancer/rebalancer-own-create-memory-duplicate-replace.test.js',
    'test/rebalancer/coordinator-reused-operation-rearm-guard.test.js',
    'test/rebalancer/replica-operation-insert-retry-idempotency.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
