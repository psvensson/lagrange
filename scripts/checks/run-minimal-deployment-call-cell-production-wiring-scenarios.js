#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Guard for the call-cell production wiring rung: the SQL-runtime handoff
// boundary composes the CallCellInvoker (routing surface + batch executor
// + reduce coordinator over the registered call_cell_reduce_* system
// tables) onto the ServiceLifecycleCommandOwner; RuntimeServiceHandler
// self-defaults its CallBindingRouteResolver; slot-scoped wire identities
// spread shard runs across replicas; and two production-composed nodes
// prove per-node shard runs, per-replica slot-leased partial publication,
// reduce on the reduce-lease holder, and exactly one visible snapshot.
// Contract: architecture/minimal-deployment-surface.md (call/pushdown).
const SCENARIOS = {
  'minimal-deployment-call-cell-production-wiring': [
    'test/bootstrap/call-cell-invocation-setup.test.js',
    'test/node/runtime-service-handler.test.js',
    'test/service/call-binding-route-resolver.test.js',
    'test/service/call-cell-invoker.test.js',
    'test/integration/minimal-deployment-call-cell-production-wiring.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
