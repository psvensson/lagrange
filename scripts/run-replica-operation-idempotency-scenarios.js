#!/usr/bin/env node
/**
 * Runner for the `replica-operation-insert-retry-idempotency` quest scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed
 * proof of the quest statement) and writes a scenario-harness report for
 * the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo runs 16-17,
 * 2/2 modal after the write-routing-freeze fix f870f7a0):
 *   replica-operation-insert-retry-idempotency
 *     - test/rebalancer/replica-operation-insert-retry-idempotency.test.js
 *       (an op-row INSERT retried after a lost outcome rides the canonical
 *        ingress OR-IGNORE lane and resolves already-applied through the
 *        authoritative visibility confirmation; absent or content-mismatched
 *        same-id rows stay hard failures)
 *     - test/rebalancer/replica-operation-repository.test.js
 *       (the surrounding persistence/visibility machinery keeps its
 *        contract under the ignoreExisting option)
 *     - test/partition/partition-cdc-parameterized-insert-or-ignore.test.js
 *       (run-18 regression: the CDC parameterized-INSERT extractor must
 *        understand OR IGNORE, or the idempotent inserts emit CDC events
 *        whose columns are literal '?' placeholder strings)
 *
 * Usage: node scripts/run-replica-operation-idempotency-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'replica-operation-insert-retry-idempotency': [
    'test/rebalancer/replica-operation-insert-retry-idempotency.test.js',
    'test/rebalancer/replica-operation-repository.test.js',
    'test/partition/partition-cdc-parameterized-insert-or-ignore.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
