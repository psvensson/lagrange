#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// WASM-first service-init scaffold guard: `lagrange service init`
// scaffolds a code-first WASM project (lagrange.service.js + vendored
// authoring library + host-unit-testable handler) that goes green
// through generate and build against the real compiler toolchain;
// `--oci` preserves the legacy OCI-container scaffold byte-for-byte;
// dev-install is demoted to a low-level compatibility note. The legacy
// OCI scaffold, pipeline, and lifecycle owners are re-run alongside to
// prove no regression.
const SCENARIOS = {
  'service-init-wasm-first-scaffold': [
    'test/cli/service-init-wasm-scaffold.test.js',
    'test/cli/service-init-scaffold.test.js',
    'test/cli/service-pipeline-command.test.js',
    'test/cli/service-install-lifecycle-cli.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
