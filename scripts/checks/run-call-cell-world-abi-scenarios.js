#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// ABI spike guard for the draft call-cell WIT world: the typed
// native-call-context contract (list<row> batches, result<_, deny-code>
// imports, run/reduce exports) stays buildable with ComponentizeJS and
// executable through the jco-transpile path the Cell runtime worker uses.
// Contract home: solve/epics/native-call-context-wit-contract.md.
const SCENARIOS = {
  'call-cell-world-component-abi-spike': [
    'test/wasm-service/call-cell-world-abi.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
