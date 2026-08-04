#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Code-first CLI pipeline guard: `lagrange service generate` compiles
// lagrange.service.js into the generated entry plus the deterministic
// .lagrange deployment tree through the real validators; `build`
// componentizes through the shared componentize owner (its fail-closed
// stage reporting is covered here; the toolchained build of the emitted
// entry shape is proven by the Q4 parity guard on the same bytes);
// `deploy` replays the generated records over the exact pgwire
// service-lifecycle grammar with the real package id substituted and
// fails closed on any rejection. The pre-existing lifecycle CLI and
// service-lifecycle owners stay green (existing-owner-reuse).
const SCENARIOS = {
  'service-cli-generate-build-deploy': [
    'test/cli/service-pipeline-command.test.js',
    'test/cli/service-install-lifecycle-cli.test.js',
    'test/cli/service-init-scaffold.test.js',
    'test/examples/service-compiler-account-summary-parity.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
