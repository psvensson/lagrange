/**
 * Integration tests for node joining rebalancing flow.
 * Requirements: 3.1, 4.1, 8.3
 */

import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ControlPlaneService} from '../../src/control-plane/control-plane-service.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
    rebalancer: {stabilizationPeriodMs: 1000},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function createMockCache(nodes = [], services = []) {
  const now = Date.now();
  const normalizedNodes = nodes.map((node) => ({
    ws_connection_state: Object.hasOwn(node, 'ws_connection_state') ?
      node.ws_connection_state : 'ready',
    ready_lease_expires_at: Object.hasOwn(node, 'ready_lease_expires_at') ?
      node.ready_lease_expires_at : now + 10000,
    ...node,
  }));
  const cache = {
    nodes: new Map(normalizedNodes.map((node) => [node.node_id, node])),
    services: new Map(services.map((service) => [service.service_id, service])),
    partitions: new Map(),
    tables: new Map(),
    message_groups: new Map(),
  };

  return {
    get: (tableName, key) => cache[tableName]?.get(key),
    filter: (tableName, predicate) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
    getAll: (tableName) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values());
    },
    getReadyNodes: () => {
      const now = Date.now();
      return Array.from(cache.nodes.values())
        .filter((node) =>
          node.ws_connection_state === 'ready' &&
          node.ready_lease_expires_at &&
          node.ready_lease_expires_at > now,
        )
        .map((node) => node.node_id);
    },
  };
}

class MockMessageGroupService extends EventEmitter {
  constructor() {
    super();
    this.groupId = 'mg-test';
    this.replicaId = 'mg-test-r1';
  }

  isLeaderReplica() {
    return true;
  }
}

function createMockCDCIntegrationService(systemTableCache, messageGroupService) {
  const emitCdc = (tableName, operation, data) => {
    if (messageGroupService) {
      messageGroupService.emit('cdcApplied', {tableName, operation, data});
    }
  };

  return {
    async insertSystemTableRow(tableName, data) {
      systemTableCache.applySystemTableChange(tableName, 'INSERT', data);
      emitCdc(tableName, 'INSERT', data);
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      systemTableCache.applySystemTableChange(tableName, 'UPDATE', merged);
      emitCdc(tableName, 'UPDATE', merged);
      return {success: true, operation: 'UPDATE', tableName, whereClause, data: merged};
    },
    async upsertSystemTableRow(tableName, data) {
      systemTableCache.applySystemTableChange(tableName, 'INSERT', data);
      emitCdc(tableName, 'UPSERT', data);
      return {success: true, operation: 'UPSERT', tableName, data};
    },
  };
}

function createMockTablePolicyService() {
  return {
    getDefaultPolicy() {
      return {...DEFAULT_TABLE_POLICY};
    },
    getTablePolicy() {
      return {...DEFAULT_TABLE_POLICY};
    },
    getPolicyForPartition() {
      return {...DEFAULT_TABLE_POLICY};
    },
  };
}

function createMockMessageRouter() {
  return {
    getConnectionState() {
      return 'connected';
    },
    isOutboundQueueAvailable() {
      return true;
    },
    async pingNode() {
      return true;
    },
    async deliver() {
      return {acknowledged: true, status: 'initiated'};
    },
  };
}

function createMockRebalanceCoordinator() {
  let counter = 0;
  return {
    async createOperation({type, partitionId, nodeId, replicaId}) {
      counter += 1;
      return {
        operationId: `op-${counter}`,
        type,
        partitionId,
        replicaId,
        targetNodeId: nodeId,
      };
    },
    getStats() {
      return {operationsCreated: counter};
    },
  };
}

async function waitFor(condition, timeoutMs = 2000, intervalMs = 25) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

test('Node joining rebalancing integration', async (t) => {
  await t.test('rebalancing waits for NODE_READY and stabilization', async (t) => {
    initializeTestEnvironment();

    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange('nodes', 'INSERT', {
      node_id: 'node-1',
      node_address: 'ws://node-1:9001',
      status: NodeStatus.ACTIVE,
      ws_connection_state: 'connected',
      ready_lease_expires_at: Date.now() + 10000,
    });

    const messageGroup = {
      systemTableCache,
      subscribeToCDC: async () => {},
      applyCDCEvent: async (tableName, operation, data) => {
        systemTableCache.applySystemTableChange(tableName, operation, data);
      },
      getSystemTableCache: () => systemTableCache,
    };

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'seed-node',
      systemTableCache,
      cdcIntegrationService: createMockCDCIntegrationService(systemTableCache),
      tablePolicyService: createMockTablePolicyService(),
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator: createMockRebalanceCoordinator(),
    });
    rebalancer.isLeader = false;
    rebalancer.scheduleNextCheck = () => {};

    const partition = {
      isLeader: true,
      subscribeToCDC: (handler) => {
        partition.cdcHandler = handler;
      },
      triggerRebalanceCheck: (_reason) => {
        rebalancer.recordStateChange('node_ready');
      },
    };

    const bootstrap = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://seed-node:9000',
    });
    bootstrap.messageGroupServices = new Map([['mg-1', messageGroup]]);
    bootstrap.partitionServices = new Map([['replica-1', partition]]);

    await bootstrap.subscribeToCDC('nodes', 'partition-1', ['replica-1']);

    await partition.cdcHandler({
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {
        node_id: 'node-1',
        ws_connection_state: 'ready',
        ready_lease_expires_at: Date.now() + 10000,
      },
    });

    t.ok(rebalancer.lastStateChangeTime !== null,
      'should record state change on NODE_READY');

    rebalancer.isLeader = true;
    let rebalanceCalled = false;
    rebalancer.rebalance = async () => {
      rebalanceCalled = true;
      return {success: true, moves: []};
    };

    await rebalancer.checkRebalance();
    t.equal(rebalanceCalled, false, 'should not rebalance before stabilization');

    rebalancer.lastStateChangeTime = Date.now() -
      rebalancer.getStabilizationPeriodMs() - 1;
    await rebalancer.checkRebalance();
    t.equal(rebalanceCalled, true, 'should rebalance after stabilization');

    rebalancer.shutdown();
  });

  await t.test('HTTP bootstrap does not trigger registration or rebalancing', async (t) => {
    initializeTestEnvironment();

    const bootstrapService = {
      triggerRebalancingOnAllPartitions: () => {
        throw new Error('should not trigger rebalancing from HTTP bootstrap');
      },
      upsertNodeConnectionState: () => {
        throw new Error('should not register nodes from HTTP bootstrap');
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node',
      seedNodeAddress: 'http://localhost:9000',
      bootstrapService,
    });
    api.systemTableCache = createMockCache();

    const reply = {code: (_status) => {}};
    const response = await api.handleBootstrapRequest({
      body: {
        nodeId: '550e8400-e29b-41d4-a716-446655440000',
        nodeAddress: 'ws://node-1:9001',
      },
    }, reply);

    t.equal(response.success, true, 'bootstrap should succeed');
  });

  await t.test('batched CREATE_REPLICA concurrency is capped per node', async (t) => {
    initializeTestEnvironment();

    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE, ws_connection_state: 'ready'},
    ]);
    const messageRouter = createMockMessageRouter();

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'seed-node',
      systemTableCache: mockCache,
      cdcIntegrationService: createMockCDCIntegrationService(mockCache),
      tablePolicyService: createMockTablePolicyService(),
      messageRouter,
      rebalanceCoordinator: createMockRebalanceCoordinator(),
    });
    rebalancer.isLeader = true;
    rebalancer.moveBatchSize = 2;
    rebalancer.interBatchDelayMs = 0;
    rebalancer.maxConcurrentMoves = 10;

    const inFlight = new Map();
    const maxInFlight = new Map();
    rebalancer.executeMove = async (move) => {
      const nodeId = move.nodeId;
      const current = (inFlight.get(nodeId) || 0) + 1;
      inFlight.set(nodeId, current);
      maxInFlight.set(nodeId, Math.max(maxInFlight.get(nodeId) || 0, current));

      await Promise.resolve();

      inFlight.set(nodeId, Math.max(0, (inFlight.get(nodeId) || 0) - 1));
      return {success: true, operation: move.type};
    };

    const result = await rebalancer.rebalance('integration_test', {
      replicaCount: 5,
      minReplicaCount: 1,
      maxReplicaCount: 7,
      placementConstraints: {spreadAcrossNodes: true},
    });

    t.equal(result.success, true);
    t.ok(result.moves.some((m) => m.operation === MoveType.ADD));
    t.equal(maxInFlight.get('node-1'), 2,
      'should not exceed batch size for node-1');

    rebalancer.shutdown();
  });

  await t.test('rebalancer dispatches replica operations after node ready', async (t) => {
    initializeTestEnvironment();

    const systemTableCache = new SystemTableCache();
    const messageGroupService = new MockMessageGroupService();
    const deliveries = [];
    const messageRouter = {
      deliver: async (target, payload) => {
        deliveries.push({target, payload});
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
      getConnectionState: () => 'connected',
      isOutboundQueueAvailable: () => true,
    };

    const cdcIntegrationService = createMockCDCIntegrationService(
      systemTableCache,
      messageGroupService,
    );

    const mockSqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };

    const rebalanceCoordinator = new RebalanceCoordinator({
      nodeId: 'seed-node',
      systemTableCache,
      cdcIntegrationService,
      messageRouter,
      tablePolicyService: createMockTablePolicyService(),
      sqlQueryEngine: mockSqlQueryEngine,
      enableTimeouts: false,
    });
    rebalanceCoordinator.initialize();

    const controlPlane = new ControlPlaneService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://seed-node:9000',
      systemTableCache,
      cdcIntegrationService,
      messageRouter,
      rebalanceCoordinator,
    });
    controlPlane.initialize();
    controlPlane.attachMessageGroupService(messageGroupService);

    const now = Date.now();
    systemTableCache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
      node_id: 'seed-node',
      node_address: 'ws://seed-node:9000',
      cpu_cores: 4,
      memory_mb: 1024,
      disk_gb: 10,
      cpu_usage_percent: 10,
      memory_usage_percent: 10,
      disk_usage_percent: 10,
      status: NodeStatus.ACTIVE,
      ws_connection_state: 'ready',
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 10000,
      created_at: now,
    });
    systemTableCache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
      node_id: 'node-2',
      node_address: 'ws://node-2:9001',
      cpu_cores: 4,
      memory_mb: 1024,
      disk_gb: 10,
      cpu_usage_percent: 20,
      memory_usage_percent: 20,
      disk_usage_percent: 20,
      status: NodeStatus.ACTIVE,
      ws_connection_state: 'ready',
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 10000,
      created_at: now,
    });

    const partitionId = 'tables-p1';
    for (const replicaId of ['tables-p1-r1', 'tables-p1-r2', 'tables-p1-r3']) {
      systemTableCache.applySystemTableChange(SystemTableName.SERVICES, 'INSERT', {
        service_id: replicaId,
        service_type: 'partition',
        node_id: 'seed-node',
        partition_id: partitionId,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
    }

    const rebalancer = new UnifiedRebalancer({
      entityId: partitionId,
      entityType: EntityType.PARTITION,
      nodeId: 'seed-node',
      systemTableCache,
      cdcIntegrationService,
      tablePolicyService: createMockTablePolicyService(),
      messageRouter,
      rebalanceCoordinator,
    });
    rebalancer.initialize();
    rebalancer.setLeader(true);

    const result = await rebalancer.rebalance('node_join');
    t.equal(result.success, true, 'rebalance should succeed');
    t.ok(result.moves.some((move) => move.operation === MoveType.ADD),
      'should schedule add moves');

    const dispatched = await waitFor(() => deliveries.length > 0);
    t.ok(dispatched, 'should dispatch replica operations');
    t.ok(
      deliveries.some((delivery) => delivery.target === 'node-2/service/replica-handler'),
      'dispatch should target joining node',
    );

    const operations = systemTableCache.getAll(SystemTableName.REPLICA_OPERATIONS);
    t.ok(
      operations.some((op) => op.target_node_id === 'node-2'),
      'should record operations targeting joining node',
    );

    const advanced = await waitFor(() =>
      systemTableCache.getAll(SystemTableName.REPLICA_OPERATIONS)
        .some((op) => op.workflow_step === 'CREATING'),
    );
    t.ok(advanced, 'operation should advance to CREATING');

    rebalancer.shutdown();
    await rebalanceCoordinator.shutdown();
    await controlPlane.shutdown();
  });
});
