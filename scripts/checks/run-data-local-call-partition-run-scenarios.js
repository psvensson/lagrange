#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Guard for the data-local partition-run frontier: shard run exports
// execute on the node hosting the selected active partition replica —
// the invoker plans shards without fetching rows, dispatches under
// host-restricted route selection with slot-scoped identities, and the
// receiver builds the typed batch from its OWN partition replica, so raw
// shard rows never cross the router before run (asserted directly in the
// two-node integration evidence).
// Contract: architecture/minimal-deployment-surface.md + the data-local
// follow-on boundary in solve/epics/minimal-deployment-surface.md.
const SCENARIOS = {
  'data-local-call-partition-run': [
    'test/service/call-binding-route-resolver.test.js',
    'test/service/call-cell-invoker.test.js',
    'test/service/call-cell-batch-executor.test.js',
    'test/node/runtime-service-call-cell-handler.test.js',
    'test/integration/minimal-deployment-call-cell-invocation-live.integration.test.js',
    'test/integration/minimal-deployment-call-cell-production-wiring.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
