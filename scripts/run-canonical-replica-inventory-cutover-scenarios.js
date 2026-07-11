#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'canonical-replica-inventory-cutover': [
    'test/rebalancer/replica-inventory.test.js',
    'test/rebalancer/canonical-replica-inventory-cutover-guard.test.js',
    'test/rebalancer/in-flight-aware-replica-count.test.js',
    'test/rebalancer/in-flight-aware-drain-phase-replace-credit.test.js',
    'test/rebalancer/move-planner-over-creation-cap.test.js',
    'test/rebalancer/rebalance-coordinator-topology-guard.test.js',
    'test/rebalancer/priority-recovery-follow-up-count-aware-add-gate.test.js',
    'test/rebalancer/rebalance-coordinator-operation-ownership.test.js',
    'test/rebalancer/unified-rebalancer.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
