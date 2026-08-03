#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Guard for the identity-and-topology fencing frontier: every data-local
// dispatch is pinned to the immutable Binding artifact (route digest
// re-assert) and to the partition ownership/epoch captured at dispatch
// (CDC-visible fence tokens re-asserted receiver-side), failing closed
// typed TARGET_STALE retryable when the selected replica, ownership, or
// topology epoch went stale — with slot-scoped wire identities keeping
// the durable fence per-dispatch.
const SCENARIOS = {
  'data-local-call-identity-topology-fencing': [
    'test/node/call-cell-partition-fence.test.js',
    'test/node/runtime-service-call-cell-handler.test.js',
    'test/service/call-binding-route-resolver.test.js',
    'test/service/call-cell-statement-adapter.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
