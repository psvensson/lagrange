#!/usr/bin/env node
/**
 * Runner for the `spread-cure-union-escape-and-monotone-gate` quest
 * scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed
 * proof of the quest statement) and writes a scenario-harness report for
 * the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from the 2026-07-18T17-40-24
 * live denial forensics: schema admission denied on
 * critical_system_spread_gap=1 while the topology guard blocked the only
 * spread cure with replica_inventory_unusable for 3+ minutes):
 *   spread-cure-union-escape-and-monotone-gate
 *     - test/rebalancer/critical-spread-terminal-stall-repro.test.js
 *     - test/rebalancer/rebalance-coordinator-topology-guard.test.js
 *       (the guard's own suite, incl. the ledger-cure boundary the
 *        generalized escape must not widen: lone-replica REPLACEs and the
 *        ledger partition stay outside the priority spread-cure escape)
 *       (the live terminal shape end-to-end: [A,A,B] priority partition,
 *        free nodes, authoritative services read unavailable -> an admitted
 *        spread-restoring operation within one evaluation cycle)
 *     - test/rebalancer/move-planner-spread-vs-count-reconciliation.test.js
 *     - test/rebalancer/move-planner-over-creation-cap.test.js
 *     - test/rebalancer/move-planner-critical-replace-serialization.test.js
 *     - test/rebalancer/priority-remove-safety-spread-nonregression.test.js
 *       (the sealed planner invariants the union escape must not re-open:
 *        run4 over-target loop, over-creation cap, REPLACE serialization,
 *        remove-safety monotonicity)
 *     - test/convergence/dt6-formation-ledger-quorum-spread-first.test.js
 *     - test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js
 *       (the ledger-cure escape this quest generalizes stays intact)
 *     - test/runtime/movielens-preload-admission-gate.test.js
 *       (monotone stability window: observer-side failures hold accumulated
 *        confirmation bounded by one stable window; real churn still resets)
 *     - test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js
 *       (spread-open denials name the gapped partitions in reason detail)
 *
 * NOTE (live validation): admission/rebalancer-policy changes must ALSO be
 * validated with a full run-affinity-demo run AND interpreted against a
 * paired clean-HEAD control before committing (standing rule from the
 * pressure-admission falsification and the 2026-07-18 flaky-baseline day).
 *
 * Usage: node scripts/run-spread-cure-union-escape-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'spread-cure-union-escape-and-monotone-gate': [
    'test/rebalancer/critical-spread-terminal-stall-repro.test.js',
    'test/rebalancer/rebalance-coordinator-topology-guard.test.js',
    'test/rebalancer/move-planner-spread-vs-count-reconciliation.test.js',
    'test/rebalancer/move-planner-over-creation-cap.test.js',
    'test/rebalancer/move-planner-critical-replace-serialization.test.js',
    'test/rebalancer/priority-remove-safety-spread-nonregression.test.js',
    'test/convergence/dt6-formation-ledger-quorum-spread-first.test.js',
    'test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js',
    'test/runtime/movielens-preload-admission-gate.test.js',
    'test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
