import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ReplicaDispatchService} from '../../src/control-plane/replica-dispatch-service.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {SERVICE_TYPE, STATE, TABLES} from '../../src/constants/index.js';

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

test('dispatch and rebalancer share consistent node readiness decisions', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const nodeId = 'node-a';
  const now = Date.now();
  const nodeRow = {
    node_id: nodeId,
    status: STATE.ACTIVE,
    ws_connection_state: STATE.READY,
    ready_lease_expires_at: now + 1000,
  };

  const systemTableCache = createSystemCache(nodeRow);
  const router = createSharedRouter(STATE.CONNECTED);
  const dispatch = createDispatchService(systemTableCache, router);
  const rebalancer = createRebalancer(systemTableCache, router);

  t.equal(dispatch.isNodeReady(nodeId), true, 'dispatch should treat ready node as ready');
  t.equal(await rebalancer.isNodeReady(nodeId), true,
    'rebalancer should treat ready node as ready');

  nodeRow.ws_connection_state = STATE.DISCONNECTED;
  t.equal(dispatch.isNodeReady(nodeId), false,
    'dispatch should reject disconnected node');
  t.equal(await rebalancer.isNodeReady(nodeId), false,
    'rebalancer should reject disconnected node');

  nodeRow.ws_connection_state = STATE.READY;
  nodeRow.ready_lease_expires_at = now - 1;
  t.equal(dispatch.isNodeReady(nodeId), false,
    'dispatch should reject expired lease');
  t.equal(await rebalancer.isNodeReady(nodeId), false,
    'rebalancer should reject expired lease');

  ConfigurationManager.resetInstance();
});
