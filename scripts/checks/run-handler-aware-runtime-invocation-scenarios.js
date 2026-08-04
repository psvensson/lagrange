#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Handler-aware runtime invocation guard: one service-cell-v2 artifact
// serves multiple HTTP routes and multiple distributed operations —
// request dispatch surfaces the bound handler_id, the call path passes
// the resolved operation id to the fixed run/reduce exports as the ABI
// argument (never inside the arguments JSON), the single-operation IR
// restriction lifts for v2 targets, and v1-interface bindings keep
// their existing invocation behavior. The resolver, normalizer, record
// generator, and entry emitter owners are re-run alongside to prove no
// v1 regression.
const SCENARIOS = {
  'handler-aware-runtime-invocation': [
    'test/service/handler-aware-runtime-invocation.test.js',
    'test/service/call-binding-route-resolver.test.js',
    'test/service/minimal-deployment-request-cell-routing.test.js',
    'test/service/call-cell-invoker.test.js',
    'test/service/service-source-contract.test.js',
    'test/service/service-deployment-record-generator.test.js',
    'test/cli/service-pipeline-command.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
