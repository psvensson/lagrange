#!/usr/bin/env node
/**
 * Runner for the `provisioning-admission-ledger-hold-transient-wait` quest
 * scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-24
 * forensics; evidence under
 * solve/changes/provisioning-admission-ledger-hold-transient-wait/):
 *   provisioning-admission-ledger-hold-transient-wait
 *     - test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js
 *       (run-24: the demo's first CREATE TABLE landed inside the legitimate
 *        run-20 ledger self-move hold and was failed to the CLIENT in one
 *        admission pass — the quorum-minimum CREATE geometry skipped the
 *        convergence wait entirely, and even where it runs its window is
 *        dwarfed by ledger-hold windows while the 30s provisioning budget
 *        had headroom. Fix: the convergence wait also covers quorum-minimum
 *        creates (satisfied at the minimum, so partial-admission creates do
 *        not slow), and a whole-cluster ALL-transient shortfall gets one
 *        budget-bounded re-wait — honest budget attribution, no raised
 *        timeouts. Guards: the run-24 reproduction, bounded never-clears,
 *        hard-rejection fail-fast, and the interlock message embedding the
 *        HELD ledger partition.)
 *
 * Usage: node scripts/run-provisioning-admission-ledger-hold-transient-wait-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'provisioning-admission-ledger-hold-transient-wait': [
    'test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
