#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const PRIORITY_RECOVERY_CENSUS_DIAGNOSTIC_GUARD_FILES = Object.freeze([
  'test/control-plane/priority-recovery-census-diagnostic-pass-through.test.js',
  'test/rebalancer/unified-rebalancer-replica-state-management-node-state-change.test.js',
  'test/rebalancer/blocked-spread-release-event-wake.test.js',
]);

runGuardTestScenarios({
  'priority-recovery-census-diagnostic-pass-through':
    PRIORITY_RECOVERY_CENSUS_DIAGNOSTIC_GUARD_FILES,
});
