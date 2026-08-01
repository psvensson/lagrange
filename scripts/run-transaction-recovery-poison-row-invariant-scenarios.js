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
  'transaction-recovery-poison-row-live-owner-engagement-v2': Object.freeze([
    'test/bootstrap/bootstrap-service-ready-signal.test.js',
    'test/bootstrap/transaction-recovery-handoff-outcome.test.js',
    'test/bootstrap/startup-runtime-handoff-owner.test.js',
    'test/query/sql-query-engine-distributed-transactions.test.js',
    'test/distributed/harness/' +
      'transaction-recovery-poison-row-live-contract.test.js',
  ]),
  'transaction-recovery-poison-row-live-summary-attribution': Object.freeze([
    'test/bootstrap/bootstrap-service-ready-signal.test.js',
    'test/bootstrap/transaction-recovery-handoff-outcome.test.js',
    'test/bootstrap/startup-runtime-handoff-owner.test.js',
    'test/query/sql-query-engine-distributed-transactions.test.js',
    'test/distributed/harness/' +
      'transaction-recovery-poison-row-live-contract.test.js',
  ]),
  'transaction-recovery-poison-row-final-sql-handoff-live-ab': Object.freeze([
    'test/bootstrap/bootstrap-service-ready-signal.test.js',
    'test/bootstrap/' +
      'node-joining-service-final-sql-runtime-handoff.test.js',
    'test/bootstrap/transaction-recovery-handoff-outcome.test.js',
    'test/bootstrap/startup-runtime-handoff-owner.test.js',
    'test/query/sql-query-engine-distributed-transactions.test.js',
    'test/distributed/harness/' +
      'transaction-recovery-poison-row-live-contract.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
