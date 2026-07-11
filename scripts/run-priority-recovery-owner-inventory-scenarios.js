#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

runGuardTestScenarios({
  'priority-recovery-owner-inventory': [
    'test/solve/priority-recovery-owner-inventory.test.js',
  ],
});
