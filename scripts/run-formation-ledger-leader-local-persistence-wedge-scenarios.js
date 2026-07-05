#!/usr/bin/env node
/**
 * Runner for the `formation-ledger-leader-local-persistence-wedge` quest
 * scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-23
 * forensics; evidence under
 * solve/changes/formation-ledger-leader-local-persistence-wedge/):
 *   formation-ledger-leader-local-persistence-wedge
 *     - test/convergence/dt6-ledger-leader-durability-fitness.test.js
 *       (the run-23 wedge: a zombie participant BEGIN IMMEDIATE made the
 *        ledger leader's every write non-durable in silence while it stayed
 *        leader. The fix makes leader-local durability part of leadership
 *        fitness: a dual-signal witness — connection stuck in a transaction
 *        beyond the legal hold, or declared-commit vs readonly-connection
 *        durable watermark divergence SUSTAINED beyond the same hold — rides
 *        the 1s transaction sweep; after 3 strikes the replica surfaces the
 *        unfitness loudly, re-asserts candidacy deferral every tick, and a
 *        leader with a viable successor demotes via the shared flap-safe
 *        sequence. Guarded shapes: run-23 zombie physics on the real
 *        partition service, the fitness contract, legal-hold and
 *        consecutive-strike controls, surface-only for successor-less
 *        groups, legal-divergence-window control.)
 *
 * Usage: node scripts/run-formation-ledger-leader-local-persistence-wedge-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-ledger-leader-local-persistence-wedge': [
    'test/convergence/dt6-ledger-leader-durability-fitness.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
