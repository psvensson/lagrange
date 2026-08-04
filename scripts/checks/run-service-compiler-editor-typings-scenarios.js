#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Service-compiler editor-typings guard: `lagrange service generate`
// emits a deterministic runtime-types.d.ts under which a misspelled
// operation key, an undeclared call target, and an undeclared statement
// column are tsc --checkJs type errors in the scaffold project, while
// correct shapes type-check clean. The pipeline and scaffold owners are
// re-run alongside to prove no regression.
const SCENARIOS = {
  'service-compiler-editor-typings': [
    'test/service/service-compiler-editor-typings.test.js',
    'test/cli/service-pipeline-command.test.js',
    'test/cli/service-init-wasm-scaffold.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
