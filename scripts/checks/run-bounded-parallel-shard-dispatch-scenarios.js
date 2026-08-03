#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// doneWhen guard for the bounded-parallel-shard-dispatch quest: the
// bounded concurrency owner in isolation, the invocation owner's
// parallel semantics (overlap, cap, completion-order independence,
// fail-closed lowest-slot selection, deadline admission stop, serial vs
// parallel identity), the pre-existing end-to-end invoker guard proving
// the sealed serial-era contract still holds on the parallel path, and
// the two-node production-composed evidence (rendezvous-barrier overlap
// across partition-host nodes, peak == limit, locality preserved,
// serial == parallel result).
const SCENARIOS = {
  'bounded-parallel-shard-dispatch': [
    'test/service/call-shard-dispatch-pool.test.js',
    'test/service/call-cell-invoker-parallel.test.js',
    'test/service/call-cell-invoker.test.js',
    'test/integration/minimal-deployment-call-cell-production-wiring.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
