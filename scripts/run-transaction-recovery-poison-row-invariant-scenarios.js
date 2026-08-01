#!/usr/bin/env node

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'transaction-recovery-poison-row-invariant': Object.freeze([
    'test/bootstrap/transaction-recovery-handoff-outcome.test.js',
    'test/query/transaction-recovery-poison-row-attribution.test.js',
    'test/bootstrap/startup-runtime-handoff-owner.test.js',
    'test/query/distributed-transaction-coordinator.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
