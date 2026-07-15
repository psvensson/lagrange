#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'transition-mutation-budget-doom-loop': [
    'test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
