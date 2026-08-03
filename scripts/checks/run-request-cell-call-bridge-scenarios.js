#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Request-cell call-bridge guard: the worker-to-parent synchronous
// host-call protocol (src/runtime/cell-host-call-protocol.js) bridges
// the blocking `call-binding` WIT import to an async parent-side
// delegate over a bounded SharedArrayBuffer channel — success and typed
// failures round-trip through the REAL componentized combined guest,
// deadline expiry poisons stale responses, bounds hold on both sides,
// and the pre-existing invocation-mode restrictions plus the combined
// service-cell world ABI stay green. The RequestCellCallBridge owner
// (src/service/request-cell-call-bridge.js) authorizes, identifies, and
// budget-composes each bridged call before delegating to the one
// existing CallCellInvoker, under the '#call-' child identity grammar
// owned by the routing contract.
const SCENARIOS = {
  'request-cell-call-bridge': [
    'test/runtime/cell-host-call-protocol.test.js',
    'test/runtime/service-cell-bridge-roundtrip.test.js',
    'test/runtime/service-cell-worker-modes.test.js',
    'test/service/call-cell-routing-contract.test.js',
    'test/service/request-cell-call-bridge.test.js',
    'test/wasm-service/service-cell-world-abi.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
