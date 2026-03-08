/**
 * UnifiedRebalancer safety preflight tests.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

function createReadyNode(nodeId) {
  return {
    node_id: nodeId,
    connection_state: 'ready',
    ready_lease_expires_at: Date.now() + 60000,
    status: 'active',
  };
}

function createMockCache(nodes = []) {
  const nodeMap = new Map(nodes.map((node) => [node.node_id, node]));
  return {
    get: (tableName, key) => {
      if (tableName === 'nodes') {
        return nodeMap.get(key);
      }
      return undefined;
    },
    filter: (tableName, predicate) => {
      if (tableName === 'nodes') {
        return Array.from(nodeMap.values()).filter(predicate);
      }
      return [];
    },
    getAll: (tableName) => {
      if (tableName === 'nodes') {
        return Array.from(nodeMap.values());
      }
      return [];
    },
  };
}

function createAlwaysReadyReadinessService() {
  return {
    getNodeReadinessSync(nodeId) {
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
        },
      };
    },
  };
}

test('UnifiedRebalancer - skips REMOVE when coordinator safety preflight blocks', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});

  let createdOperations = 0;
  const mockCoordinator = {
    getMoveSafetyError: (move) => {
      if (move.type === MoveType.REMOVE) {
        return 'Critical partition nodes-p1 would drop voter-ready replicas below minimum (2/3)';
      }
      return null;
    },
    createOperation: async () => {
      createdOperations++;
      return {operationId: 'unexpected-create'};
    },
    getStats: () => ({
      operationsCreated: createdOperations,
      operationsCompleted: 0,
      operationsFailed: 0,
      operationsTimedOut: 0,
      inFlightOperations: 0,
      totalOperations: createdOperations,
    }),
  };

  const rebalancer = new UnifiedRebalancer({
    entityId: 'nodes-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: createMockCache([createReadyNode('seed-node')]),
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3, minReplicaCount: 3}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      deliver: async () => ({acknowledged: true, status: 'completed'}),
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: mockCoordinator,
    controlPlaneReadinessService: createAlwaysReadyReadinessService(),
  });

  rebalancer.initialize();
  try {
    const result = await rebalancer.executeMove({
      type: MoveType.REMOVE,
      nodeId: 'seed-node',
      replicaId: 'nodes-p1-r1',
      reason: 'spread_replicas',
    });

    t.equal(result.success, false, 'remove should be skipped by safety preflight');
    t.equal(result.skipped, true, 'remove should be marked as skipped');
    t.equal(result.reason, 'safety_blocked', 'skip reason should indicate safety policy block');
    t.equal(createdOperations, 0, 'coordinator should not create blocked remove operations');
  } finally {
    rebalancer.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('UnifiedRebalancer - defers non-failed REMOVE when no ADD target is ready',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});

    let createdOperations = 0;
    const createdMoveTypes = [];
    const mockCoordinator = {
      getMoveSafetyError: () => null,
      createOperation: async (move) => {
        createdOperations++;
        createdMoveTypes.push(move.type);
        return {operationId: `op-${createdOperations}`};
      },
      getStats: () => ({
        operationsCreated: createdOperations,
        operationsCompleted: 0,
        operationsFailed: 0,
        operationsTimedOut: 0,
        inFlightOperations: 0,
        totalOperations: createdOperations,
      }),
    };

    const rebalancer = new UnifiedRebalancer({
      entityId: 'nodes-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'seed-node',
      systemTableCache: createMockCache([
        createReadyNode('seed-node'),
        createReadyNode('node-unready'),
      ]),
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({targetReplicaCount: 3, minReplicaCount: 3}),
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true, status: 'completed'}),
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      rebalanceCoordinator: mockCoordinator,
      controlPlaneReadinessService: createAlwaysReadyReadinessService(),
    });

    rebalancer.initialize();
    rebalancer.isNodeReady = async (nodeId) => nodeId !== 'node-unready';
    try {
      const results = await rebalancer.executeRebalancingMoves([
        {
          type: MoveType.ADD,
          nodeId: 'node-unready',
          reason: 'increase_replica_count',
        },
        {
          type: MoveType.REMOVE,
          nodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
          reason: 'spread_replicas',
        },
      ]);

      t.equal(createdOperations, 0,
        'should not create operations when adds are blocked by node readiness');
      t.same(createdMoveTypes, [], 'no move should be scheduled through coordinator');
      t.ok(
        results.some((result) =>
          result.skipped === true && result.reason === 'awaiting_ready_add_capacity'),
        'should report deferred remove due to unavailable add capacity',
      );
    } finally {
      rebalancer.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
