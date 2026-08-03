#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Guard corpus for the HTTP-to-distributed-call composition (brief:
// docs/development/http-endpoint-distributed-call-composition-brief.md):
// the multi-node integration proof (request Cell + real bridge + real
// two-node call path, child identity, typed refusal, durable replay),
// the RequestCellCallBridge owner contract, the end-to-end worker
// bridge round trip through the real componentized service-cell guest,
// and the canonical kebab-to-camel component export resolution seam.
const SCENARIOS = {
  'http-to-call-composition-proof': [
    'test/integration/http-to-call-composition.integration.test.js',
    'test/runtime/component-export-resolution.test.js',
    'test/runtime/service-cell-bridge-roundtrip.test.js',
    'test/service/request-cell-call-bridge.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
