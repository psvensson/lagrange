import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  MoveType,
} from '../../src/rebalancer/unified-rebalancer.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({});

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function createMockCache(nodes = [], services = [], replicaOperations = []) {
  const now = Date.now();
  const normalizedNodes = nodes.map((node) => ({
    ws_connection_state: Object.hasOwn(node, 'ws_connection_state') ?
      node.ws_connection_state :
      'ready',
    ready_lease_expires_at: Object.hasOwn(node, 'ready_lease_expires_at') ?
      node.ready_lease_expires_at :
      now + 60_000,
    ...node,
  }));

  const tableMaps = {
    nodes: new Map(normalizedNodes.map((row) => [row.node_id, row])),
    services: new Map(services.map((row) => [row.service_id, row])),
    replica_operations: new Map(replicaOperations.map((row) => [row.operation_id, row])),
  };

  return {
    get(tableName, key) {
      return tableMaps[tableName]?.get(key);
    },
    filter(tableName, predicate) {
      const table = tableMaps[tableName];
      if (!table) {
        return [];
      }
      return Array.from(table.values()).filter(predicate);
    },
    getAll(tableName) {
      const table = tableMaps[tableName];
      if (!table) {
        return [];
      }
      return Array.from(table.values());
    },
  };
}

function createTestRebalancer({
  nodes,
  services,
  policy = {},
} = {}) {
  const dispatchedMoves = [];
  const systemTableCache = createMockCache(nodes, services);

  const rebalancer = new UnifiedRebalancer({
    entityId: 'partition-1',
    entityType: EntityType.PARTITION,
    nodeId: 'node-1',
    systemTableCache,
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true};
      },
    },
    tablePolicyService: {
      getPolicyForPartition() {
        return {
          targetReplicaCount: 3,
          minReplicaCount: 3,
          maxReplicaCount: 7,
          placementConstraints: {
            spreadAcrossNodes: true,
            considerCpuLoad: true,
          },
          ...policy,
        };
      },
    },
    messageRouter: {
      getConnectionState() {
        return 'connected';
      },
      async deliver() {
        return {acknowledged: true, status: 'completed'};
      },
      async pingNode() {
        return true;
      },
      isOutboundQueueAvailable() {
        return true;
      },
    },
    rebalanceCoordinator: {
      async createOperation(move) {
        dispatchedMoves.push({...move});
        return {
          operationId: `op-${dispatchedMoves.length}`,
          type: move.type,
          partitionId: move.partitionId,
          targetNodeId: move.nodeId,
          status: 'pending',
          workflowStep: 'pending',
        };
      },
      async executeOperation() {
        return {success: true};
      },
      getStats() {
        return {
          operationsCreated: 0,
          operationsCompleted: 0,
          operationsFailed: 0,
          operationsTimedOut: 0,
          inFlightOperations: 0,
          totalOperations: 0,
        };
      },
    },
  });

  rebalancer.initialize();
  rebalancer.isLeader = true;
  return {rebalancer, dispatchedMoves};
}

test('UnifiedRebalancer planner single-path enforcement', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('rebalance delegates planning without using legacy local methods', async (t) => {
    const {rebalancer} = createTestRebalancer({
      nodes: [
        {node_id: 'node-1', status: 'active', cpu_usage_percent: 60},
        {node_id: 'node-2', status: 'active', cpu_usage_percent: 10},
      ],
      services: [
        {
          service_id: 'partition-1-r1',
          replica_id: 'partition-1-r1',
          partition_id: 'partition-1',
          service_type: 'partition',
          node_id: 'node-1',
          status: 'active',
        },
      ],
      policy: {targetReplicaCount: 2},
    });

    rebalancer.calculateTargetState = () => {
      throw new Error('legacy_calculateTargetState_used');
    };
    rebalancer.calculateMoves = () => {
      throw new Error('legacy_calculateMoves_used');
    };

    let thrown = null;
    try {
      await rebalancer.rebalance(TriggerType.PERIODIC);
    } catch (error) {
      thrown = error;
    } finally {
      rebalancer.shutdown();
    }

    t.equal(
      thrown,
      null,
      'runtime planning should not call UnifiedRebalancer local planning methods',
    );
  });

  await t.test('runtime planning does not generate duplicate ADDs to a single node', async (t) => {
    const {rebalancer, dispatchedMoves} = createTestRebalancer({
      nodes: [
        {node_id: 'node-1', status: 'active', cpu_usage_percent: 40},
        {node_id: 'node-2', status: 'active', cpu_usage_percent: 10},
      ],
      services: [],
      policy: {targetReplicaCount: 3},
    });

    try {
      await rebalancer.rebalance(TriggerType.PERIODIC);
    } finally {
      rebalancer.shutdown();
    }

    const addMoves = dispatchedMoves.filter((move) => move.type === 'ADD');
    const addCountByNode = new Map();
    for (const move of addMoves) {
      addCountByNode.set(move.nodeId, (addCountByNode.get(move.nodeId) || 0) + 1);
    }

    for (const [nodeId, count] of addCountByNode.entries()) {
      t.ok(
        count <= 1,
        `node ${nodeId} should receive at most one ADD move, received ${count}`,
      );
    }

    const scheduledAddNodes = new Set(addMoves.map((move) => move.nodeId));
    t.equal(
      scheduledAddNodes.size,
      addMoves.length,
      'ADD move list should not contain duplicate node targets',
    );
  });
});
