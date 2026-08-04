#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Deployment-record generation guard: from a fixed IR the generator
// (src/service/service-deployment-record-generator.js) reproduces a
// byte-identical .lagrange tree whose manifest, bindings, access policy,
// and deployment plan pass through the existing manifest validator,
// binding contract, and access-policy normalizer as final authority;
// each handler calls entry yields exactly one policy allowlist binding
// and one logical-id-to-generated-binding-name mapping in
// deployment-plan.json, and no deployment contract rule is
// re-implemented in the generator.
const SCENARIOS = {
  'service-compiler-deployment-record-generation': [
    'test/service/service-deployment-record-generator.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
