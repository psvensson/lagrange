#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'rolling-restart-pre-handoff-recovery-discriminator': Object.freeze([
    'test/distributed/harness/__tests__/' +
      'restart-recovery-handoff-failure-barrier.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
