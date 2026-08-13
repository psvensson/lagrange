#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'harness-runtime-environment-allowlist': Object.freeze([
    'test/distributed/harness/__tests__/cluster-runtime-environment-allowlist.test.js',
  ]),
  'harness-runtime-environment-allowlist-v2': Object.freeze([
    'test/distributed/harness/__tests__/cluster-runtime-environment-allowlist.test.js',
  ]),
  'harness-runtime-environment-allowlist-v3': Object.freeze([
    'test/distributed/harness/__tests__/cluster-runtime-environment-allowlist.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
