#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Sealing guard for the native call-context WIT contract: the four sealed
// decisions (call-context as the sole call/pushdown surface, declared
// partition-local statement on call/pushdown Binding sources, dropped u32
// capability probe with typed deny-code refusals, Binding-declared batch
// memory bound) stay pinned in the surface doc, fixture world, Binding
// contract source, and epic decision log.
// Contract home: solve/epics/native-call-context-wit-contract.md.
const SCENARIOS = {
  'native-call-context-contract-sealing': [
    'test/contract/native-call-context-contract.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
