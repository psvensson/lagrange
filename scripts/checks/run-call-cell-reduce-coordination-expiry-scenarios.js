#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Guard for the reduce-coordination expiry rung: lapsed slot rows and
// abandoned result rows are reclaimed within a bounded retention window
// (published snapshots persist), swept opportunistically by the
// invocation owner once per new invocation — coordination garbage stays
// bounded without a background reaper, and the full invocation paths
// stay green with the sweep active.
const SCENARIOS = {
  'call-cell-reduce-coordination-expiry': [
    'test/runtime/call-cell-reduce-coordinator.test.js',
    'test/service/call-cell-invoker.test.js',
    'test/integration/minimal-deployment-call-cell-invocation-live.integration.test.js',
    'test/integration/minimal-deployment-call-cell-production-wiring.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
