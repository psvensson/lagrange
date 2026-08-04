#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Service source contract guard: every lagrange.service.js definition is
// either normalized by the one owner (src/service/service-source-contract.js)
// into an immutable IR whose identities come only from explicit object keys,
// or rejected with a named diagnostic per violation; and the frozen authoring
// descriptors under src/authoring import cleanly with no Node-only
// dependencies.
const SCENARIOS = {
  'service-compiler-source-contract-ir': [
    'test/authoring/authoring-descriptors.test.js',
    'test/service/service-source-contract.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
