import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ReplicaDispatchService} from '../../src/control-plane/replica-dispatch-service.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {SERVICE_STATUS, SERVICE_TYPE, STATE, TABLES} from '../../src/constants/index.js';

function createSystemCache(nodeRow) {
  return {
    get: (tableName, key) => {
      if (tableName === TABLES.NODES && key === nodeRow.node_id) {
        return nodeRow;
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.NODES) {
        return [nodeRow].filter(predicate);
      }
      return [];
    },
    getAll: (_tableName) => [],
  };
}

function createSharedRouter(connectionState = STATE.CONNECTED) {
  return {
    getConnectionState: () => connectionState,
    isOutboundQueueAvailable: () => true,
    pingNode: async () => true,
  };
}

function createRebalancer(systemTableCache, messageRouter) {
  return new UnifiedRebalancer({
    entityId: 'nodes-p1',
    entityType: SERVICE_TYPE.PARTITION,
    nodeId: 'seed-node',
    messageRouter,
    systemTableCache,
    cdcIntegrationService: {},
    tablePolicyService: {
      getPolicyForPartition: () => ({
        targetReplicaCount: 3,
        placementConstraints: {},
      }),
    },
    rebalanceCoordinator: {},
  });
}

function createDispatchService(systemTableCache, messageRouter) {
  return new ReplicaDispatchService({
    nodeId: 'seed-node',
    messageRouter,
    systemTableCache,
    cdcIntegrationService: {},
    rebalanceCoordinator: {},
  });
}

test('dispatch readiness is lease-based while rebalancer keeps transport checks', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeId = 'node-a';
  const now = Date.now();
  const nodeRow = {
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    ready_lease_expires_at: now + 1000,
  };

  const systemTableCache = createSystemCache(nodeRow);
  const router = createSharedRouter(STATE.CONNECTED);
  const dispatch = createDispatchService(systemTableCache, router);
  const rebalancer = createRebalancer(systemTableCache, router);

  t.equal(dispatch.isNodeReady(nodeId), true, 'dispatch should treat ready node as ready');
  t.equal(await rebalancer.isNodeReady(nodeId), true,
    'rebalancer should treat ready node as ready');

  nodeRow.connection_state = STATE.DISCONNECTED;
  t.equal(dispatch.isNodeReady(nodeId), true,
    'dispatch readiness should not depend on connection_state');
  t.equal(await rebalancer.isNodeReady(nodeId), true,
    'rebalancer readiness should not depend on connection_state');

  const disconnectedRouter = createSharedRouter(STATE.DISCONNECTED);
  const disconnectedDispatch = createDispatchService(
    systemTableCache,
    disconnectedRouter,
  );
  const disconnectedRebalancer = createRebalancer(
    systemTableCache,
    disconnectedRouter,
  );
  t.equal(disconnectedDispatch.isNodeReady(nodeId), true,
    'dispatch should allow lease-ready nodes without transport-specific gating');
  t.equal(await disconnectedRebalancer.isNodeReady(nodeId), false,
    'rebalancer should reject nodes without transport connectivity');
  disconnectedRebalancer.shutdown();

  nodeRow.connection_state = STATE.READY;
  nodeRow.ready_lease_expires_at = now - 1;
  t.equal(dispatch.isNodeReady(nodeId), false,
    'dispatch should reject expired lease');
  t.equal(await rebalancer.isNodeReady(nodeId), false,
    'rebalancer should reject expired lease');

  ConfigurationManager.resetInstance();
});

test('dispatch initialization requires full cache read APIs', async (t) => {
  const service = new ReplicaDispatchService({
    nodeId: 'seed-node',
    messageRouter: {},
    systemTableCache: {},
    cdcIntegrationService: {},
    rebalanceCoordinator: {},
  });
  t.throws(
    () => service.initialize(),
    /systemTableCache.get/,
    'service should fail fast when cache read APIs are missing',
  );
});

test('dispatch reads use cache-backed owner state only', async (t) => {
  const now = Date.now();
  const operationRow = {
    operation_id: 'op-cache-first-1',
    type: 'ADD',
    partition_id: 'tables-p1',
    replica_id: 'tables-p1-r4',
    source_node_id: 'seed-node',
    target_node_id: 'node-a',
    status: 'pending',
    workflow_step: 'PENDING',
    created_at: now,
    updated_at: now,
    steps_history: '[]',
  };
  const nodeRow = {
    node_id: 'node-a',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    ready_lease_expires_at: now + 30000,
  };
  const serviceRow = {
    node_id: 'node-a',
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
  };

  let executeCount = 0;
  const service = new ReplicaDispatchService({
    nodeId: 'seed-node',
    messageRouter: {},
    systemTableCache: {
      get: (tableName, key) => {
        if (tableName === TABLES.NODES && key === nodeRow.node_id) {
          return nodeRow;
        }
        if (tableName === TABLES.REPLICA_OPERATIONS &&
            key === operationRow.operation_id) {
          return operationRow;
        }
        return null;
      },
      getAll: (tableName) => {
        if (tableName === TABLES.REPLICA_OPERATIONS) {
          return [operationRow];
        }
        if (tableName === TABLES.SERVICES) {
          return [serviceRow];
        }
        return [];
      },
    },
    cdcIntegrationService: {
      updateSystemTableRow: async (_tableName, whereClause, updateData) => {
        if (whereClause?.operation_id === operationRow.operation_id &&
            whereClause?.workflow_step === 'PENDING' &&
            operationRow.workflow_step === 'PENDING') {
          operationRow.workflow_step = updateData.workflow_step;
          operationRow.updated_at = updateData.updated_at;
          return {
            success: true,
            partitionResult: {
              affectedRows: 1,
            },
          };
        }
        return {
          success: true,
          partitionResult: {
            affectedRows: 0,
          },
        };
      },
    },
    rebalanceCoordinator: {
      executeOperation: async () => {
        executeCount += 1;
        return {success: true};
      },
    },
  });

  const node = await service.getNodeRow('node-a');
  const operation = await service.getReplicaOperationRow('op-cache-first-1');
  const hasHandler = await service.hasHandlerOnTarget(
    'node-a',
    SERVICE_TYPE.PARTITION,
  );
  await service.retryPendingDispatchesForNode('node-a');

  t.equal(node.node_id, 'node-a', 'node read should come from cache');
  t.equal(
    operation.operation_id,
    'op-cache-first-1',
    'operation read should come from cache',
  );
  t.equal(hasHandler, true, 'handler probe should use cache-backed services');
  t.equal(executeCount, 1, 'pending cache-backed operation should dispatch once');
});
