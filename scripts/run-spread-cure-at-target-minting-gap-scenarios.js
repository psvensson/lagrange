#!/usr/bin/env node
/**
 * Runner for the `spread-cure-at-target-minting-gap` quest scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed
 * proof of the quest statement) and writes a scenario-harness report for
 * the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from the 2026-07-19T07-22-01
 * live timeout forensics: after the surplus drain completed, the TERMINAL
 * rows of the drained lineage — a completed ADD and REMOVE still visible to
 * the unfiltered entity operation read — defeated the conservative-union
 * escape's blanket topology-increasing check, so every spread ADD for the
 * at-target [A,A,B] priority partition was denied
 * replica_inventory_unusable until schema-admission timeout):
 *   spread-cure-at-target-minting-gap
 *     - test/rebalancer/spread-cure-at-target-minting-gap.test.js
 *       (the RED->GREEN anchors: terminal drain residue at planner-cycle
 *        and guard levels, plus the unrelated-entity non-wedge case)
 *     - test/rebalancer/critical-spread-terminal-stall-repro.test.js
 *     - test/rebalancer/rebalance-coordinator-topology-guard.test.js
 *       (the sealed escape behavior this quest narrows: provenance
 *        preconditions, occupied/target-count rows, one-cure-per-tick
 *        re-block via the admitted cure's own add-transitional row)
 *     - test/rebalancer/move-planner-over-creation-cap.test.js
 *     - test/rebalancer/move-planner-critical-replace-serialization.test.js
 *     - test/rebalancer/priority-remove-safety-spread-nonregression.test.js
 *       (the sealed planner invariants that must not reopen)
 *
 * NOTE (live validation): admission/rebalancer-policy changes must ALSO be
 * validated with a full run-affinity-demo run AND interpreted against a
 * paired clean-HEAD control before committing (standing rule from the
 * pressure-admission falsification and the 2026-07-18 flaky-baseline day).
 *
 * Usage: node scripts/run-spread-cure-at-target-minting-gap-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'spread-cure-at-target-minting-gap': [
    'test/rebalancer/spread-cure-at-target-minting-gap.test.js',
    'test/rebalancer/critical-spread-terminal-stall-repro.test.js',
    'test/rebalancer/rebalance-coordinator-topology-guard.test.js',
    'test/rebalancer/move-planner-over-creation-cap.test.js',
    'test/rebalancer/move-planner-critical-replace-serialization.test.js',
    'test/rebalancer/priority-remove-safety-spread-nonregression.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
