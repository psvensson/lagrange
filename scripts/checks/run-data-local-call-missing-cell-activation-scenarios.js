#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Guard for the missing-cell activation frontier: a shard host without a
// ready Binding Cell triggers a bounded activation lease (CDC-propagated
// call_activation_leases system table) published by the invocation owner;
// the placement planner consumes LIVE leases as deterministic pins (the
// REAL MovePlanner forces pinned available nodes into target), capacity
// appears through the executor seam, the invoker's bounded retry then
// runs the shard locally — and a lapsed lease stops pinning so the
// normal surplus cure reclaims the replica. No caller placement, no
// second scheduler.
const SCENARIOS = {
  'data-local-call-missing-cell-activation': [
    'test/rebalancer/call-activation-pin-planning.test.js',
    'test/service/call-cell-invoker.test.js',
    'test/cache/default-cache-sync-table-selection.test.js',
    'test/migration/migration-constants-and-registration.test.js',
    'test/integration/data-local-call-missing-cell-activation.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
