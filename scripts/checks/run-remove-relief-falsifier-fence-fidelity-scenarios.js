#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// The CL-044/CL-043 remove-safety falsifiers must reach evaluateRemoveSafety
// (they model the fence-exempt failed-replica recovery remove class), and the
// priority-surplus placement fence's own DT6 guard is co-measured so falsifier
// fidelity can never be bought by weakening the fence.
const SCENARIOS = {
  'remove-relief-falsifier-fence-fidelity-v2': [
    'test/rebalancer/operation-workflow-remove-safety-concurrent-down-target.test.js',
    'test/rebalancer/operation-workflow-remove-safety-concurrent-stale-phantom.test.js',
    'test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
