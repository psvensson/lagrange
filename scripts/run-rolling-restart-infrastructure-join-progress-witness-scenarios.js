#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'rolling-restart-infrastructure-join-progress-witness': Object.freeze([
    'test/bootstrap/' +
      'node-joining-infrastructure-join-progress-witness.test.js',
    'test/distributed/harness/__tests__/' +
      'restart-recovery-handoff-failure-barrier.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
