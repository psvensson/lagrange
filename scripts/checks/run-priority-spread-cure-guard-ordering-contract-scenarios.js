#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Coupled-order guard for the spread-cure exemption. The coordinator test
// reaches the real createOperation path and records both admission calls; the
// dispatch test proves the named downstream readiness owner leaves a not-ready
// operation pending and wakes it when the target becomes ready.
const SCENARIOS = {
  'priority-spread-cure-guard-ordering-contract': [
    'test/rebalancer/rebalance-coordinator-operation-ownership.test.js',
    'test/control-plane/replica-dispatch-atomic-claim.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
