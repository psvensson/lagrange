#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'rolling-restart-handoff-witness-projection': Object.freeze([
    'test/distributed/harness/__tests__/' +
      'startup-runtime-handoff-readiness-projection.test.js',
    'test/distributed/harness/__tests__/' +
      'cluster-restart-recovery-held.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
