#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'rolling-restart-fresh-formation-terminal-add-observation-v2': Object.freeze([
    'test/rebalancer/replica-operation-repository.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
