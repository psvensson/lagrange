import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TABLES} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
config.initialize();

function createMockMessageRouter() {
  return {
    deliver: async () => ({acknowledged: true, success: true}),
  };
}

function uniqueNodeIds(nodeIds) {
  return [...new Set(nodeIds)];
}

test('SQLQueryEngine - default CREATE TABLE quorum can temporarily fall back ' +
  'during transient control-plane recovery', async (t) => {
  const partitionId = 'tbl-default-quorum-recovery-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const services = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'ready'},
    {node_id: 'node-c', status: 'active', connection_state: 'ready'},
  ];

  const cache = {
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

  const buildDeniedAdmission = (nodeId) => ({
    allowed: false,
    decisionType: 'blocked',
    blockingReasons: [
      'insufficient_placement_eligible_nodes',
      'control_plane_write_unhealthy',
    ],
    ineligibleNodes: [{
      nodeId,
      failedDimensions: ['controlPlaneWritable'],
      reasonCodes: [
        'control_plane_write_unhealthy',
        'cluster_member_unhealthy',
      ],
    }],
  });
  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      if (move.nodeId === localNodeId) {
        return {allowed: true};
      }
      return {
        allowed: false,
        decisionType: 'blocked',
        admissionResult: buildDeniedAdmission(move.nodeId),
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        ...move,
        operationId: `op-${move.nodeId}`,
        replicaId: `${partitionId}-r${createdTargetNodeIds.length}`,
        createdAt: Date.now(),
        stepsHistory: [{}],
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        replica_id: operation.replicaId || operation.replica_id,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: 'leader',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 10,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  const summary = await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    minimumRoutableReplicaCountWasDefaulted: true,
  });

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c'],
    'admission should probe the full default CREATE TABLE target set',
  );
  t.same(
    createdTargetNodeIds,
    [localNodeId],
    'transient recovery fallback should create only the provisionable target',
  );
  t.same(
    executedTargetNodeIds,
    [localNodeId],
    'fallback target should still use normal replica creation',
  );
  t.equal(
    summary.resolvedReplicaCount,
    1,
    'default CREATE TABLE provisioning can resolve to one replica',
  );
  t.equal(
    summary.minimumRoutableReplicaCount,
    1,
    'default quorum floor is lowered only for transient recovery fallback',
  );
  t.equal(
    summary.routableReplicaCount,
    1,
    'fallback returns after one replica is routable',
  );
});

test('SQLQueryEngine - default CREATE TABLE fallback rejects permanent ' +
  'provisioning shortfalls', (t) => {
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: {
      filter: () => [],
      getAll: () => [],
    },
    messageRouter: createMockMessageRouter(),
  });
  const resolveFallbackMinimum = ({
    rejectedTargetNodePlans,
    hasExplicitMinimumRoutableReplicaCount = false,
  }) => engine.resolveProvisioningShortfallFallbackMinimum({
    hasExplicitMinimumRoutableReplicaCount,
    maximumProvisionableReplicaCount: 1,
    implicitFallbackMinimumReplicaCount: 2,
    rejectedTargetNodePlans,
  });

  t.equal(
    resolveFallbackMinimum({
      rejectedTargetNodePlans: [{
        blockingReasons: [
          'insufficient_placement_eligible_nodes',
          'control_plane_write_unhealthy',
        ],
        reasonCodes: [
          'control_plane_write_unhealthy',
          'cluster_member_unhealthy',
        ],
      }],
    }),
    1,
    'aggregate placement shortfall can fall back with transient node reasons',
  );
  t.equal(
    resolveFallbackMinimum({
      rejectedTargetNodePlans: [{
        blockingReasons: ['insufficient_placement_eligible_nodes'],
        reasonCodes: [],
      }],
    }),
    2,
    'placement-only shortfall keeps the implicit default floor',
  );
  t.equal(
    resolveFallbackMinimum({
      rejectedTargetNodePlans: [{
        blockingReasons: [
          'insufficient_placement_eligible_nodes',
          'storage_budget_unavailable',
        ],
        reasonCodes: [
          'control_plane_write_unhealthy',
          'storage_budget_unavailable',
        ],
      }],
    }),
    2,
    'mixed permanent and transient shortfalls keep the implicit default floor',
  );
  t.equal(
    resolveFallbackMinimum({
      hasExplicitMinimumRoutableReplicaCount: true,
      rejectedTargetNodePlans: [{
        blockingReasons: ['control_plane_write_unhealthy'],
        reasonCodes: ['cluster_member_unhealthy'],
      }],
    }),
    2,
    'explicit caller minimums are never lowered by transient fallback',
  );
  t.end();
});
