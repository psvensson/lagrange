#!/usr/bin/env node

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-reservation-reconcile-premature-orphan-release': [
    'test/rebalancer/reservation-reconcile-premature-orphan-release.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
