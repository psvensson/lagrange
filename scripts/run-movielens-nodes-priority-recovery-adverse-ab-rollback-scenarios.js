#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

runGuardTestScenarios({
  'movielens-nodes-priority-recovery-adverse-ab-rollback': [
    'test/bootstrap/system-partition-classification-owner.test.js',
    'test/bootstrap/traffic-readiness-utils.test.js',
    'test/control-plane/priority-recovery-authoritative-summary-inventory-alignment.test.js',
    'test/rebalancer/unified-rebalancer-triggers-bootstrap-lifecycle.test.js',
    'test/rebalancer/unified-rebalancer-triggers-critical-deferral.test.js',
  ],
});
