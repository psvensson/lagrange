#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Guard for the call-cell invocation rung: an authenticated CALL BINDING
// command flows resolve -> declared-statement fan-out -> typed per-shard
// batches -> run export per shard -> leased partials -> reduce over a
// complete fresh disjoint set -> exactly one atomically visible snapshot,
// with legacy statement-less bindings failing closed not-invocable.
// Contract: architecture/minimal-deployment-surface.md (call/pushdown).
const SCENARIOS = {
  'minimal-deployment-call-cell-invocation': [
    'test/query/service-lifecycle-call-invocation.test.js',
    'test/service/call-binding-route-resolver.test.js',
    'test/service/call-cell-batch-executor.test.js',
    'test/service/call-cell-invoker.test.js',
    'test/service/call-cell-statement-adapter.test.js',
    'test/runtime/call-cell-worker.test.js',
    'test/runtime/call-cell-reduce-coordinator.test.js',
    'test/node/runtime-service-call-cell-handler.test.js',
    'test/integration/minimal-deployment-call-cell-invocation-live.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
