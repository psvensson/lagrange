#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Generic-dispatch service-cell-v2 world guard: the canonical authoring
// package (wit/world.wit) gains the additive v2 world with fixed exports
// handle-request(handler, request) / run(operation, batch, arguments) /
// reduce(operation, partials, arguments); a generated-entry component's
// dispatch tables route two request handlers and two distributed
// operations by id and refuse unknown ids with typed errors under jco
// instantiation; and the pre-existing service-cell, request-cell, and
// call-cell worlds validate and build unchanged.
const SCENARIOS = {
  'service-cell-v2-generic-dispatch-world': [
    'test/wasm-service/service-cell-v2-world-abi.test.js',
    'test/wasm-service/service-cell-world-abi.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
