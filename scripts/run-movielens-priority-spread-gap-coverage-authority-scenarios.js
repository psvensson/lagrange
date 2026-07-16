#!/usr/bin/env node
/**
 * Deterministic guard runner for numeric priority-spread gap coverage.
 *
 * The snapshot suite exercises the production planner-to-publication closure
 * seam. The directed spread suite pins distinct-target counting and preserves
 * the existing optimistic gap-one and stalled-operation controls.
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'movielens-priority-spread-gap-coverage-authority': [
    'test/control-plane/priority-recovery-snapshot.test.js',
    'test/control-plane/priority-recovery-spread-stall-unmask.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
