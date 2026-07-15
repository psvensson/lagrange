#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'user-partition-remote-executor-outcome-owner-wakeup': [
    'test/rebalancer/coordinator-created-user-partition-remote-outcome.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
