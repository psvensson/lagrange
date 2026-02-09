/**
 * Task 6: Message-group rebalancer runtime wiring tests.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {TABLES} from '../../src/constants/tables.js';

function createMockCache({
  nodes = [],
  services = [],
  messageGroups = [],
  replicaOperations = [],
} = {}) {
  const cache = {
    nodes: new Map(nodes.map((row) => [row.node_id, row])),
    services: new Map(services.map((row) => [row.service_id, row])),
    message_groups: new Map(messageGroups.map((row) => [row.group_id, row])),
    replica_operations: new Map(replicaOperations.map((row) => [row.operation_id, row])),
  };

  return {
    get: (tableName, key) => cache[tableName]?.get(key),
    filter: (tableName, predicate) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
  };
}

function createMockCoordinator() {
  return {
    getMoveSafetyError: () => null,
    createOperation: async (move) => ({
      operationId: 'op-' + Date.now(),
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      status: 'pending',
      workflowStep: 'pending',
    }),
    executeOperation: async () => ({success: true}),
    getStats: async () => ({
      inFlightOperations: 0,
      operationsCreated: 0,
      operationsCompleted: 0,
      operationsFailed: 0,
    }),
  };
}

function createMockTransport() {
  return {
    deliver: async () => ({acknowledged: true}),
    initialize: async () => {},
    shutdown: async () => {},
    setServiceNodeResolver: () => {},
  };
}

test('Task 6 - message-group rebalancer wiring', async (t) => {
  t.beforeEach(async () => {
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('message-group replica discovery reads services rows', async (t) => {
    const rebalancer = new UnifiedRebalancer({
      entityId: 'mg-1',
      entityType: EntityType.MESSAGE_GROUP,
      nodeId: 'node-1',
      systemTableCache: createMockCache({
        services: [
          {
            service_id: 'mg-1-r1',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            group_id: 'mg-1',
            node_id: 'node-1',
            status: 'active',
          },
          {
            service_id: 'mg-1-r2',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            group_id: 'mg-1',
            node_id: 'node-2',
            status: 'active',
          },
          {
            service_id: 'p1-r1',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'p1',
            node_id: 'node-1',
            status: 'active',
          },
        ],
      }),
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true}),
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      rebalanceCoordinator: createMockCoordinator(),
    });

    const replicas = rebalancer.getCurrentReplicas();
    t.equal(replicas.length, 2, 'should discover replicas from services rows');
    t.ok(
      replicas.every((row) =>
        row.service_type === SERVICE_TYPE.MESSAGE_GROUP && row.group_id === 'mg-1',
      ),
      'should include only message_group rows for the target group',
    );
  });

  await t.test('message-group in-flight operations use canonical entity identity', async (t) => {
    const rebalancer = new UnifiedRebalancer({
      entityId: 'mg-1',
      entityType: EntityType.MESSAGE_GROUP,
      nodeId: 'node-1',
      systemTableCache: createMockCache({
        replicaOperations: [
          {
            operation_id: 'op-mg-1',
            type: 'ADD',
            status: 'pending',
            workflow_step: 'pending',
            partition_id: 'mg-1',
            entity_type: 'message_group',
            entity_id: 'mg-1',
            target_node_id: 'node-2',
          },
          {
            operation_id: 'op-p-1',
            type: 'ADD',
            status: 'pending',
            workflow_step: 'pending',
            partition_id: 'p-1',
            entity_type: 'partition',
            entity_id: 'p-1',
            target_node_id: 'node-2',
          },
        ],
      }),
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true}),
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      rebalanceCoordinator: createMockCoordinator(),
    });

    const inFlight = rebalancer.getInFlightOperations();
    t.equal(inFlight.length, 1, 'should include in-flight op for this message group');
    t.equal(
      inFlight[0]?.operation_id,
      'op-mg-1',
      'should select operation by message-group entity identity',
    );
  });

  await t.test('leader message-group service wires UnifiedRebalancer runtime', async (t) => {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'node-1',
      replicaIds: ['mg-1-r1'],
      transport: createMockTransport(),
    });

    const nodeService = NodeService.getInstance();
    nodeService.setSystemCacheProxy(createMockCache({
      nodes: [
        {
          node_id: 'node-1',
          status: 'active',
          ws_connection_state: 'ready',
          ready_lease_expires_at: Date.now() + 60000,
        },
      ],
      services: [
        {
          service_id: 'mg-1-r1',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          group_id: 'mg-1',
          node_id: 'node-1',
          status: 'active',
          address: 'node-1/message-group/mg-1-r1',
        },
      ],
      messageGroups: [
        {
          group_id: 'mg-1',
          leader_node_id: 'node-1',
        },
      ],
    }));
    service.systemTableCache = nodeService.getSystemTableCache();

    await service.initialize();
    service.setCdcIntegrationService({
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
      sqlQueryEngine: {executeQuery: async () => ({success: true, rows: []})},
    });
    service.setTablePolicyService({
      getPolicyForPartition: () => ({}),
    });
    service.setRebalanceCoordinator(createMockCoordinator());

    t.ok(service.rebalancer, 'should instantiate message-group UnifiedRebalancer');
    t.equal(
      service.rebalancer.entityType,
      EntityType.MESSAGE_GROUP,
      'should wire message-group entity type',
    );
    t.equal(service.rebalancer.entityId, 'mg-1', 'should wire group id as entity id');

    await service.shutdown();
    NodeService.getInstance().setSystemCacheProxy(service.systemTableCache);

    t.notOk(service.rebalancer, 'shutdown should clear message-group rebalancer');
  });
});
