#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Rung-4 parity guard for the code-first account-summary example
// (solve/epics/code-first-service-compiler.md): the committed
// lagrange.service.js drives the real generator and the shared
// componentize owner to reproduce the example's deployment surface — both
// routes, the one call Binding, and the generated outbound-call policy
// that gates the call — with the hand-built deployment builder deleted and
// no raw Binding-name literal left in the example sources.
const SCENARIOS = {
  'service-compiler-account-summary-parity': [
    'test/examples/service-compiler-account-summary-parity.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
