#!/usr/bin/env node
/**
 * Runner for the service↔data affinity placement quest scenarios
 * (epic: solve/epics/service-data-affinity-placement.md).
 *
 * Executes each scenario's deterministic guard-test suite (the committed
 * proof of the quest statement) and writes a scenario-harness report for
 * the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests:
 *   service-read-locality-policy
 *     - test/query/service-read-locality-routing.test.js
 *       (service_definitions.read_locality column end-to-end: schema +
 *        serialize/deserialize + create/update validation + engine
 *        policy resolution + executeSelect threading + candidate
 *        ordering local-node/same-group first, policy-off unchanged)
 *   placement-data-affinity-tier1b
 *     - test/convergence/dt-placement-affinity-tier1b-kernel.test.js
 *       (DATA_AFFINITY dimension + in-score incumbent movement-cost in
 *        the real placement kernel, driven through the REAL MovePlanner:
 *        gradient above the margin moves the service toward its data,
 *        gradient below is damped to zero moves, gated-off output
 *        unchanged)
 *   service-partition-access-attribution
 *     - test/query/service-partition-access-attribution.test.js
 *       (A[service][partition] feed: engine-side read/write recording
 *        for issuing services, delta publisher with failure restore,
 *        service_partition_access system table registered end-to-end)
 *   service-data-affinity-parallel-reduce-demo
 *     - test/runtime/movielens-affinity-demo-wiring.test.js
 *       (canonical entity attribution from placed replicas, disjoint
 *        shard selection, partial top-N publication, exact bounded
 *        merge, production-equivalent node-weight locality evidence,
 *        and native_js lifecycle wiring)
 *     - test/runtime/service-runtime-lifecycle.test.js
 *       (failed driver starts terminate as FAILED, never ACTIVE)
 *     - test/node/runtime-service-handler.test.js
 *       (placed replica descriptors preserve canonical entity identity)
 *   runtime-service-affinity-policy-lift
 *     - test/rebalancer/runtime-service-affinity-policy-lift.test.js
 *       (getRuntimeServicePolicy lifts read_locality=same_group +
 *        fresh attribution into dataAffinity.groupWeights +
 *        preferDataAffinity, coherent with routing; end-to-end walk
 *        record -> publish -> aggregate -> policy -> kernel dimensions)
 *   seed-join-gate-authoritative-refresh
 *     - test/bootstrap/bootstrap-api-seed-join-gate-authoritative-refresh.test.js
 *       (stale cache/fresh authority admits, genuine leaderlessness rejects,
 *        and cache-hit/probe paths perform no authoritative reads)
 *   join-retry-patience-selectable
 *     - test/bootstrap/join-retry-patience-selectable.test.js
 *       (permanent limited/elapsed-only config ingress, retryable leader-metadata
 *        behavior through both postures, elapsed exhaustion, and unchanged
 *        non-retryable failure handling)
 *
 * Usage: node scripts/run-placement-affinity-scenarios.js [scenario]
 *   (default: run all scenarios)
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'service-read-locality-policy': [
    'test/query/service-read-locality-routing.test.js',
  ],
  'placement-data-affinity-tier1b': [
    'test/convergence/dt-placement-affinity-tier1b-kernel.test.js',
  ],
  'service-partition-access-attribution': [
    'test/query/service-partition-access-attribution.test.js',
  ],
  'runtime-service-affinity-policy-lift': [
    'test/rebalancer/runtime-service-affinity-policy-lift.test.js',
  ],
  'movielens-affinity-placement-demo': [
    'test/runtime/movielens-affinity-demo-wiring.test.js',
  ],
  'service-data-affinity-parallel-reduce-demo': [
    'test/runtime/movielens-affinity-demo-wiring.test.js',
    'test/runtime/sql-query-loop-parallel-reduce-sql.test.js',
    'test/runtime/service-runtime-lifecycle.test.js',
    'test/node/runtime-service-handler.test.js',
  ],
  'movielens-three-way-affinity-demo': [
    'test/runtime/movielens-three-way-affinity-demo.test.js',
    'test/runtime/movielens-affinity-demo-wiring.test.js',
    'test/runtime/sql-query-loop-parallel-reduce-sql.test.js',
    'test/runtime/service-runtime-lifecycle.test.js',
    'test/node/runtime-service-handler.test.js',
    'test/rebalancer/runtime-service-affinity-policy-lift.test.js',
    'test/runtime/movielens-formation-probe-wiring.test.js',
  ],
  'runtime-replica-state-projection': [
    'test/runtime/runtime-replica-state-projection-wiring.test.js',
  ],
  'movielens-preload-admission-gate-cutover': [
    'test/runtime/movielens-preload-admission-gate.test.js',
    'test/distributed/harness/__tests__/' +
      'control-plane-quiescence-snapshot.test.js',
    'test/admin/admin-websocket-api-messaging-and-errors.test.js',
  ],
  'control-snapshot-heartbeat-lease-freshness': [
    'test/admin/admin-control-snapshot-heartbeat-lease-freshness.test.js',
    'test/runtime/movielens-preload-admission-gate.test.js',
  ],
  'configured-split-threshold-policy-precedence': [
    'test/partition/partition-split-policy-precedence.test.js',
    'test/policy/table-policy-service.test.js',
    'test/partition/partition-split-merge-manager.test.js',
  ],
  'seed-join-gate-authoritative-refresh': [
    'test/bootstrap/bootstrap-api-seed-join-gate-authoritative-refresh.test.js',
  ],
  'join-retry-patience-selectable': [
    'test/bootstrap/join-retry-patience-selectable.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
