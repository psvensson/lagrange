/**
 * Quest voter-ready-60s / ledger-concentration blocker (s14).
 *
 * R09 supersession alignment: sealed quest
 * `serve-eligibility-committed-epoch-read`
 * (`solve/quests/serve-eligibility-committed-epoch-read/quest.json`, commit
 * `2f83f97fdc48`) explicitly deleted the internal multi-window progress-polling
 * loop in `SQLQueryEngine.waitForProvisionTargetNodeIds` and delegated retry
 * pacing to `SchemaProvisioningJobOwner`.
 *
 * Sealed F10/C6 contract under test:
 *  1. Under `operation_ledger_quorum_concentrated` shortfall below
 *     `minimumRoutable`, `provisionInitialTablePartition` performs zero
 *     internal sleep/polling (`clock.nowMs === 0`) and throws
 *     `TABLE_PARTITION_PROVISIONING_RETRYABLE`.
 *  2. Once ledger drain reaches quorum (`>= 2` / `3` admitted nodes), caller
 *     retry of `provisionInitialTablePartition` and `CREATE TABLE` succeeds in
 *     a single pass with `clock.nowMs === 0`.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
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

function createCohortCoordinator({
  admittedNodeIds,
  services,
  createdTargetNodeIds,
  localNodeId,
}) {
  return {
    async checkProvisioningAdmission(move) {
      return admittedNodeIds.has(move.nodeId) ?
        ADMIT :
        QUORUM_CONCENTRATED_REJECTION;
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        replicaId: `${move.partitionId}-${move.nodeId}`,
        ...move,
      };
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
  let sleepCalls = 0;
  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    controlPlaneReadinessService: createProvisioningReadyService(cache),
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 5,
    nowFn: () => clock.nowMs,
  });
  engine.tableCreationService.setControlPlaneSystemTableGateway({
    async readRows() {
      return {success: true, rows: []};
    },
  });
  engine.tableCreationService.createTable = (ast, createOptions) =>
    engine.tableCreationService.executeCreateTableProvisioning(
      ast,
      createOptions,
    );
  engine.waitForPartitionServiceMetadata = async () => {};
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  engine.sleep = async (durationMs) => {
    sleepCalls += 1;
    clock.nowMs += durationMs;
  };
  return {engine, getSleepCalls: () => sleepCalls};
}

test('F10/C6: operation_ledger_quorum_concentrated shortfall below ' +
  'minimumRoutable fails immediately with zero internal polling', async (t) => {
  const partitionId = 'tbl-s14-shortfall-below-quorum-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const clock = {nowMs: 0};
  const admittedNodeIds = new Set(['node-a']);
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  const rebalanceCoordinator = createCohortCoordinator({
    admittedNodeIds,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const {engine, getSleepCalls} = createEngineFixture({
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
    {
      code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE,
      message: /minimum routable provisioning cohort/,
    },
    'shortfall below quorum throws TABLE_PARTITION_PROVISIONING_RETRYABLE',
  );
  t.equal(getSleepCalls(), 0, 'zero internal sleep calls');
  t.equal(clock.nowMs, 0, 'virtual clock stays at 0ms');
  t.same(createdTargetNodeIds, [], 'no replica operations created below quorum');
});

test('F10/C6: caller retry of provisionInitialTablePartition succeeds in one ' +
  'pass once ledger drain reaches quorum (>= 2 / 3 admitted nodes)',
async (t) => {
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const clock = {nowMs: 0};
  const admittedNodeIds = new Set();
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  const rebalanceCoordinator = createCohortCoordinator({
    admittedNodeIds,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const {engine, getSleepCalls} = createEngineFixture({
    rebalanceCoordinator,
    cache,
    localNodeId,
    clock,
  });

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId: 'tbl-s14-quorum-retry-p1',
      replicaCount: 3,
      minimumRoutableReplicaCount: 2,
      minimumRoutableReplicaCountWasDefaulted: true,
    }),
    {code: QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE},
    'zero admitted targets throws TABLE_PARTITION_PROVISIONING_RETRYABLE',
  );
  t.equal(clock.nowMs, 0);

  // Ledger drain reaches 2-of-3 quorum; caller retries in a single pass.
  admittedNodeIds.add('node-a');
  admittedNodeIds.add('node-b');
  const quorumSummary = await engine.provisionInitialTablePartition({
    partitionId: 'tbl-s14-quorum-retry-p1',
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });
  t.equal(
    quorumSummary.contractState,
    OWNER_CONTRACT_STATE.UNDER_REPLICATED,
    '2-of-3 admitted cohort completes at quorum as under_replicated',
  );
  t.equal(quorumSummary.committedReplicaCount, 2);
  t.equal(quorumSummary.missingReplicaCount, 1);
  t.same(createdTargetNodeIds, ['node-a', 'node-b']);
  t.equal(getSleepCalls(), 0);
  t.equal(clock.nowMs, 0, 'quorum retry completes in one pass with nowMs === 0');

  // Full 3-of-3 admitted cohort also completes in one pass with nowMs === 0.
  createdTargetNodeIds.length = 0;
  admittedNodeIds.add('node-c');
  const fullSummary = await engine.provisionInitialTablePartition({
    partitionId: 'tbl-s14-full-retry-p1',
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });
  t.equal(fullSummary.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(fullSummary.committedReplicaCount, 3);
  t.equal(fullSummary.missingReplicaCount, 0);
  t.same(createdTargetNodeIds, ['node-a', 'node-b', 'node-c']);
  t.equal(getSleepCalls(), 0);
  t.equal(clock.nowMs, 0);
});

test('F10/C6: CREATE TABLE fails fast below quorum and caller retry succeeds ' +
  'in a single pass once ledger drain reaches quorum', async (t) => {
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const clock = {nowMs: 0};
  const admittedNodeIds = new Set(['node-a']);
  const {services, cache} = createClusterFixture({
    nodeIds: ['node-a', 'node-b', 'node-c'],
  });
  const rebalanceCoordinator = createCohortCoordinator({
    admittedNodeIds,
    services,
    createdTargetNodeIds,
    localNodeId,
  });
  const {engine, getSleepCalls} = createEngineFixture({
    rebalanceCoordinator,
    cache,
    localNodeId,
    clock,
  });

  const blockedCreate = await engine.executeQuery(
    'CREATE TABLE s14_quorum_probe (id TEXT PRIMARY KEY)',
  );
  t.equal(blockedCreate.success, false, 'CREATE TABLE fails fast below quorum');
  t.equal(
    blockedCreate.errorCode,
    QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE,
    'CREATE TABLE surfaces TABLE_PARTITION_PROVISIONING_RETRYABLE',
  );
  t.equal(getSleepCalls(), 0);
  t.equal(clock.nowMs, 0);

  admittedNodeIds.add('node-b');
  admittedNodeIds.add('node-c');
  const retriedCreate = await engine.executeQuery(
    'CREATE TABLE s14_quorum_probe (id TEXT PRIMARY KEY)',
  );
  t.equal(retriedCreate.success, true, 'caller retry of CREATE TABLE succeeds');
  t.same(
    createdTargetNodeIds.sort(),
    ['node-a', 'node-b', 'node-c'],
    'all admitted cohort replicas provisioned in one pass',
  );
  t.equal(getSleepCalls(), 0);
  t.equal(clock.nowMs, 0);
});
