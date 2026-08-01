#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'rolling-restart-durable-rejoin-formation-barrier': Object.freeze([
    'test/convergence/dt-formation-priority-placement-before-active.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
