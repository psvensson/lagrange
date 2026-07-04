#!/usr/bin/env node
/**
 * Runner for the `write-routing-repair-under-control-plane-moves` quest
 * scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed
 * proof of the quest statement) and writes a scenario-harness report for
 * the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from run-15 forensics,
 * data/examples/service-data-affinity-demo/):
 *   write-routing-repair-under-control-plane-moves
 *     - test/partition/partition-write-kernel.test.js
 *       (commit-mode kernel refuses unilateral DIRECT self-commit when a
 *        known remote leader or the partition row's replica_count
 *        contradicts a stale self-only replica list)
 *     - test/partition/partition-service-stale-topology-write-guard.test.js
 *       (the run-15 poison: a REPLACE-added replica with a churn-collapsed
 *        replica list must REJECT forwarded writes — no phantom raft log
 *        entries, no phantom operation rows — instead of forking the group;
 *        plus metadata-publication helper wiring)
 *     - test/raft/authoritative-row-mutation-helper.test.js
 *       (the run-15 trigger: a leader_node_id/raft_role publication whose
 *        CAS guard misses observed state must surface the miss and refresh
 *        the guard row from the authority instead of silently thrashing —
 *        run-15 starved the leader pointer for 4.3 minutes, freezing write
 *        routing for the whole move window)
 *     - test/cdc/cdc-refresh-authoritative-cache-row.test.js
 *       (the guard-refresh primitive aligns present-but-stale cache rows)
 *     - test/integration/single-node-default-replica-count-writes.integration.test.js
 *       (verifier-mandated liveness guard: replica_count is a TARGET, not
 *        actual membership — the lone placed replica of a replica_count=3
 *        partition on a one-node cluster must keep serving durable writes,
 *        and rejected query-routed writes must never be acked as success)
 *
 * Usage: node scripts/run-write-routing-repair-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'write-routing-repair-under-control-plane-moves': [
    'test/partition/partition-write-kernel.test.js',
    'test/partition/partition-service-stale-topology-write-guard.test.js',
    'test/raft/authoritative-row-mutation-helper.test.js',
    'test/cdc/cdc-refresh-authoritative-cache-row.test.js',
    'test/integration/single-node-default-replica-count-writes.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
