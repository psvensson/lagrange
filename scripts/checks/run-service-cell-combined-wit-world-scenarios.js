#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Combined service-cell WIT world guard: the canonical authoring package
// (wit/world.wit) keeps all three worlds buildable with ComponentizeJS
// and executable through the jco-transpile path the Cell runtime worker
// uses; the worker's invocation-mode restriction keeps every host import
// that is not authorized for the current mode failing closed; and the
// pre-existing request-only and call-only consumers stay green against
// the canonical package.
const SCENARIOS = {
  'service-cell-combined-wit-world': [
    'test/wasm-service/service-cell-world-abi.test.js',
    'test/runtime/service-cell-worker-modes.test.js',
    'test/wasm-service/call-cell-world-abi.test.js',
    'test/runtime/call-cell-worker.test.js',
    'test/examples/js-request-binding-example.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
