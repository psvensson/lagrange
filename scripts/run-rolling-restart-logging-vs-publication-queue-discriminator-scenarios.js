#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'rolling-restart-logging-vs-publication-queue-discriminator': Object.freeze([
    'test/distributed/harness/__tests__/' +
      'logging-publication-queue-source-identity.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
