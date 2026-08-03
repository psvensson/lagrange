#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Aggregate doneWhen guard for the data-local call activation quest: the
// four frontier surfaces together — partition-local run, missing-cell
// activation, identity/topology fencing, and owner-boundary
// preservation — over the real two-node evidence.
const SCENARIOS = {
  'data-local-call-partition-activation': [
    'test/service/call-binding-route-resolver.test.js',
    'test/service/call-cell-invoker.test.js',
    'test/node/call-cell-partition-fence.test.js',
    'test/rebalancer/call-activation-pin-planning.test.js',
    'test/service/data-local-owner-boundaries.test.js',
    'test/integration/minimal-deployment-call-cell-production-wiring.integration.test.js',
    'test/integration/data-local-call-missing-cell-activation.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
