#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// CL-016/CL-021 marker-clear integrity guard: the replica lifecycle
// persistence owner clears the local-only services-row marker ONLY on a
// confirmed durable apply. A returned readiness deferral (success:false)
// or a zero-row apply (observed_state_changed) must retain the marker so
// the CL-021 reconcile owner keeps retrying the idempotent UPSERT —
// otherwise a joiner's priority replica stays invisible to the
// priority-spread census forever (live witness
// public-path-multinode-baseline-20260811T095750Z: 63x 'No row found
// for CDC update', readyDistinctNodeCount pinned at 2/3 all run).
const SCENARIOS = {
  'priority-services-row-marker-clear-integrity': [
    'test/node/replica-local-only-row-convergence.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
