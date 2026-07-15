#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'coordinator-reconcile-lane-ledger-write-head-of-line': [
    'test/rebalancer/coordinator-reconcile-lane-ledger-write-head-of-line.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
