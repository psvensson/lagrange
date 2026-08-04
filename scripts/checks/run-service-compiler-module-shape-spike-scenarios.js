#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Rung-1 gate of the code-first service compiler epic
// (solve/epics/code-first-service-compiler.md): a ComponentizeJS-built
// component whose generated entrypoint statically imports the unmodified
// developer module graph (lagrange.service.js + authoring stub + local
// handler module) exports the existing service-cell world, dispatches two
// HTTP routes by method+path inside handle-request, and routes a
// handler's call(opRef) to the canonical call-binding host import —
// proven by jco instantiation against captured host fakes.
const SCENARIOS = {
  'service-compiler-componentize-module-shape-spike': [
    'test/wasm-service/service-compiler-module-shape-spike.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
