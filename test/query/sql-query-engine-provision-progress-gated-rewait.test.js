/**
 * Quest voter-ready-60s / ledger-concentration blocker (s14).
 *
 * The MovieLens demo's CREATE TABLE aborts at [2/4] with provisionable=0 while
 * `replica_operations-p1` is bootstrap-concentrated (all voters on the seed).
 * The cure is a ledger self-move REPLACE spread off the seed; it legitimately
 * takes TWO serialized REPLACEs (~25-40s) — longer than the base provisioning
 * budget — so the existing single-window transient re-wait times out and the
 * create fails, even though the spread is actively progressing (diagnostic:
 * budget-bound, raising the budget greens it).
 *
 * Contract under test: the whole-cluster transient re-wait extends past the
 * base window WHILE the ledger quorum concentration is measurably improving
 * (progress-gated, ceiling-bounded), tolerates the STATIC gap between the two
 * serialized spread REPLACEs, and fails fast on a genuine wedge (no progress).
 * The progress signal is the coordinator's authoritative concentration measure,
 * NOT a raised unconditional timeout (that is vetted-dead masking).
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TABLES} from '../../src/constants/index.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

import {createMockMessageRouter} from './sql-query-engine-test-support.js';

const QUORUM_CONCENTRATED_REJECTION = Object.freeze({
  allowed: false,
  decisionType: 'deferred',
  admissionResult: {
    allowed: false,
    decisionType: 'deferred',
    blockingReasons: ['operation_ledger_quorum_concentrated'],
  },
});

const ADMIT = Object.freeze({
  allowed: true,
  decisionType: 'admitted',
  admissionResult: {allowed: true, decisionType: 'admitted'},
});

function createClusterFixture({nodeIds}) {
  const nodes = nodeIds.map((nodeId) => ({node_id: nodeId, status: 'active'}));
  const services = [];
  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };
  return {nodes, services, cache};
}

/**
 * A coordinator whose ledger spread is driven by a scripted per-window
 * concentration trajectory. `checkProvisioningAdmission` admits once the spread
 * has cleared (`admitAtWindow` snapshots taken); `resolveOperation...Snapshot`
 * yields the next scripted concentration reading, one per re-wait window.
 */
function createProgressCoordinator({
  concentrationByWindow,
  admitAtWindow,
  services,
  createdTargetNodeIds,
  localNodeId,
  omitSnapshotMethod = false,
}) {
  let snapshotCalls = 0;
  const coordinator = {
    async checkProvisioningAdmission() {
      return snapshotCalls >= admitAtWindow ? ADMIT :
        QUORUM_CONCENTRATED_REJECTION;
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {operationId: `op-${move.nodeId}`, ...move};
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id:
          operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id:
          operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };
  if (!omitSnapshotMethod) {
    coordinator.resolveOperationLedgerConcentrationProgressSnapshot = () => {
      const reading =
        concentrationByWindow[
          Math.min(snapshotCalls, concentrationByWindow.length - 1)
        ];
      snapshotCalls += 1;
      if (reading === null) {
        return {holdEngaged: false, worstConcentration: null};
      }
      return {holdEngaged: true, worstConcentration: reading};
    };
  } else {
    // Advance the spread anyway so admission can clear, without a snapshot.
    coordinator.checkProvisioningAdmission = async () => {
      const admit = snapshotCalls >= admitAtWindow;
      snapshotCalls += 1;
      return admit ? ADMIT : QUORUM_CONCENTRATED_REJECTION;
    };
  }
  return coordinator;
}

function createEngineFixture({rebalanceCoordinator, cache, localNodeId}) {
  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    // Compressed geometry: base window small; ceiling = 3x base.
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 5,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  engine.sleep = async () => {};
  return engine;
}

test('s14: a PROGRESSING ledger spread that outlasts the base window is ' +
  'waited out — the create succeeds (RED on the single-window head)',
async (t) => {
  const partitionId = 'tbl-s14-progressing-spread-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  // Two serialized REPLACEs: worst-concentration 3 -> 2 (REPLACE-1), then
  // cleared (REPLACE-2). Admits after 2 windows of progress.
  const rebalanceCoordinator = createProgressCoordinator({
    concentrationByWindow: [2, null],
    admitAtWindow: 2,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const engine = createEngineFixture({rebalanceCoordinator, cache, localNodeId});

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });

  t.same(
    createdTargetNodeIds.sort(),
    ['node-a', 'node-b', 'node-c'],
    'all three replicas provisioned once the progressing spread cleared — ' +
      'the create extended past the base window instead of failing',
  );
});

test('s14: the STATIC gap between the two serialized spread REPLACEs does NOT ' +
  'look like a wedge — the create still succeeds', async (t) => {
  const partitionId = 'tbl-s14-inter-move-gap-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  // worst: 2 (REPLACE-1 done), 2 (STATIC — REPLACE-2 being planned), then
  // admits. The one static window must be tolerated (stallWindows=2).
  const rebalanceCoordinator = createProgressCoordinator({
    concentrationByWindow: [2, 2, null],
    admitAtWindow: 2,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const engine = createEngineFixture({rebalanceCoordinator, cache, localNodeId});

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });

  t.same(
    createdTargetNodeIds.sort(),
    ['node-a', 'node-b', 'node-c'],
    'the inter-REPLACE static window was tolerated; the create did not bail',
  );
});

test('control: a genuine WEDGE (concentration never improves) fails fast, ' +
  'bounded — no masking', async (t) => {
  const partitionId = 'tbl-s14-wedge-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  // Concentration STATIC at 3 forever; admission never clears.
  const rebalanceCoordinator = createProgressCoordinator({
    concentrationByWindow: [3],
    admitAtWindow: Number.POSITIVE_INFINITY,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const engine = createEngineFixture({rebalanceCoordinator, cache, localNodeId});

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
      minimumRoutableReplicaCount: 2,
      minimumRoutableReplicaCountWasDefaulted: true,
    }),
    /minimum routable provisioning cohort/,
    'a wedge (no spread progress) still surfaces the canonical typed failure',
  );
  t.same(createdTargetNodeIds, [], 'nothing was planned under the wedge');
});
