#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'priority-spread-cold-boot-dt': [
    'test/convergence/dt-priority-partition-spread-cold-boot-network.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
