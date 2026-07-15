#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

runGuardTestScenarios({
  'priority-recovery-authoritative-summary-inventory-alignment': [
    'test/control-plane/priority-recovery-authoritative-summary-inventory-alignment.test.js',
  ],
});
