/**
 * Quest voter-ready-60s / ledger-concentration blocker (s14).
 *
 * Contract after W6: a whole-cluster transient hold may consume the remaining
 * caller-owned provisioning budget, but progress never creates a fresh budget.
 * Progress inside the deadline succeeds, a late cure cannot resurrect CREATE,
 * and a wedge stops exactly at the parent deadline.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TABLES} from '../../src/constants/index.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

import {
  createMockMessageRouter,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';

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
  const rowsByTable = new Map([
    [TABLES.NODES, nodes],
    [TABLES.SERVICES, services],
  ]);
  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      return (rowsByTable.get(type) || []).filter(predicate);
    },
    getAll(type) {
      return rowsByTable.get(type) || [];
    },
  };
  return {nodes, services, cache};
}

/**
 * A coordinator whose ledger spread becomes admissible at a virtual timestamp.
 */
function createProgressCoordinator({
  clock,
  admitAtMs,
  services,
  createdTargetNodeIds,
  localNodeId,
}) {
  return {
    async checkProvisioningAdmission() {
      return clock.nowMs >= admitAtMs ? ADMIT :
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
}

function createEngineFixture({rebalanceCoordinator, cache, localNodeId, clock}) {
  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    controlPlaneReadinessService: createProvisioningReadyService(cache),
    // Compressed geometry: one 40ms parent budget shared by every wait.
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 5,
    nowFn: () => clock.nowMs,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  engine.sleep = async (durationMs) => {
    clock.nowMs += durationMs;
  };
  return engine;
}

test('s14/W6: a progressing ledger spread inside the parent deadline is ' +
  'waited out and CREATE succeeds',
async (t) => {
  const partitionId = 'tbl-s14-progressing-spread-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const clock = {nowMs: 0};
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  const rebalanceCoordinator = createProgressCoordinator({
    clock,
    admitAtMs: 20,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const engine = createEngineFixture({
    rebalanceCoordinator,
    cache,
    localNodeId,
    clock,
  });

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });

  t.same(
    createdTargetNodeIds.sort(),
    ['node-a', 'node-b', 'node-c'],
    'all three replicas provisioned once the in-budget spread cleared',
  );
  t.equal(clock.nowMs, 20, 'the cure completed inside the 40ms parent budget');
});

test('s14/W6: progress near expiry still succeeds without extending the ' +
  'deadline', async (t) => {
  const partitionId = 'tbl-s14-inter-move-gap-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const clock = {nowMs: 0};
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  const rebalanceCoordinator = createProgressCoordinator({
    clock,
    admitAtMs: 39,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const engine = createEngineFixture({
    rebalanceCoordinator,
    cache,
    localNodeId,
    clock,
  });

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });

  t.same(
    createdTargetNodeIds.sort(),
    ['node-a', 'node-b', 'node-c'],
    'the near-expiry in-budget cure remains usable',
  );
  t.equal(clock.nowMs, 39, 'the shared deadline was not reset');
});

test('control: a genuine WEDGE (concentration never improves) fails fast, ' +
  'bounded — no masking', async (t) => {
  const partitionId = 'tbl-s14-wedge-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const clock = {nowMs: 0};
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  const rebalanceCoordinator = createProgressCoordinator({
    clock,
    admitAtMs: Number.POSITIVE_INFINITY,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const engine = createEngineFixture({
    rebalanceCoordinator,
    cache,
    localNodeId,
    clock,
  });

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
  t.equal(clock.nowMs, 40, 'the wedge stops at the parent deadline');
});
