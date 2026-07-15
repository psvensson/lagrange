#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-runtime-service-create-lane-budget-starvation': [
    'test/rebalancer/runtime-service-create-add-budget-reservation.test.js',
    'test/rebalancer/formation-runtime-service-create-lane-budget-starvation.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
