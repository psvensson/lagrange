/**
 * Tests for ReplicaRecoveryService.
 * Requirements: 14.2
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  ReplicaRecoveryService,
  NodeStatus,
  ReplicaStatus,
  ServiceType,
} from '../../src/node/replica-recovery-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a mock CDC integration service for testing.
 * @return {Object} Mock CDC integration service.
 */
function createMockCDCService() {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({type: 'update', tableName, whereClause, data});
      return {success: true, operation: 'UPDATE', tableName, whereClause, data};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      return {success: true, operation: 'DELETE', tableName, whereClause};
    },
  };
}

/**
 * Create a mock system table cache for testing.
 * @param {Object} data - Initial cache data.
 * @return {Object} Mock system table cache.
 */
function createMockCache(data = {}) {
  const cache = {
    nodes: data.nodes || [],
    services: data.services || [],
    partitions: data.partitions || [],
    message_groups: data.message_groups || [],
  };

  return {
    getAll(tableName) {
      return cache[tableName] || [];
    },
    filter(tableName, predicate) {
      const items = cache[tableName] || [];
      return items.filter(predicate);
    },
    get(tableName, id) {
      const items = cache[tableName] || [];
      return items.find((item) =>
        item.id === id ||
        item.node_id === id ||
        item.partition_id === id ||
        item.group_id === id,
      );
    },
  };
}

test('ReplicaRecoveryService - constructor', async (t) => {
  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
  });

  t.equal(service.nodeId, 'test-node', 'should set nodeId');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.equal(service.isRunning(), false, 'should not be running');
  t.end();
});

test('ReplicaRecoveryService - initialize', async (t) => {
  const mockCDC = createMockCDCService();
  const mockCache = createMockCache();
  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });

  service.initialize();

  t.equal(service.isInitialized(), true, 'should be initialized');
  t.end();
});

test('ReplicaRecoveryService - initialize requires nodeId', async (t) => {
  const service = new ReplicaRecoveryService({});

  try {
    service.initialize();
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('requires nodeId'), 'should have error message');
  }
  t.end();
});

test('ReplicaRecoveryService - start and stop', async (t) => {
  const mockCDC = createMockCDCService();
  const mockCache = createMockCache();
  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  service.start();
  t.equal(service.isRunning(), true, 'should be running after start');

  service.stop();
  t.equal(service.isRunning(), false, 'should not be running after stop');
  t.end();
});

test('ReplicaRecoveryService - start requires initialization', async (t) => {
  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
  });

  try {
    service.start();
    t.fail('should throw error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'should have error message');
  }
  t.end();
});

test('ReplicaRecoveryService - creates partition replica when below minimum', async (t) => {
  const mockCDC = createMockCDCService();

  const mockCache = createMockCache({
    nodes: [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.FAILED}, // Failed node
    ],
    partitions: [
      {partition_id: 'partition-1', table_id: 'table-1', replica_count: 3},
    ],
    services: [
      // Only 2 healthy replicas (one on failed node)
      {
        service_id: 'service-1',
        node_id: 'node-1',
        partition_id: 'partition-1',
        service_type: ServiceType.PARTITION_REPLICA,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'service-2',
        node_id: 'node-2',
        partition_id: 'partition-1',
        service_type: ServiceType.PARTITION_REPLICA,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'service-3',
        node_id: 'node-3', // On failed node
        partition_id: 'partition-1',
        service_type: ServiceType.PARTITION_REPLICA,
        status: ReplicaStatus.FAILED,
      },
    ],
  });

  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const events = [];
  service.on('replicaCreated', (e) => events.push(e));

  await service.checkReplicaCounts();

  t.equal(events.length, 1, 'should emit replicaCreated event');
  t.equal(events[0].type, 'partition', 'should be partition type');
  t.equal(events[0].partitionId, 'partition-1', 'should have correct partitionId');

  // Check CDC operation
  const insertOps = mockCDC.operations.filter((op) =>
    op.type === 'insert' && op.tableName === SystemTableName.SERVICES,
  );
  t.equal(insertOps.length, 1, 'should have one insert operation');
  t.equal(insertOps[0].data.service_type, ServiceType.PARTITION_REPLICA,
    'should create partition replica');
  t.equal(insertOps[0].data.partition_id, 'partition-1',
    'should have correct partition_id');
  t.end();
});

test('ReplicaRecoveryService - creates message group replica when below minimum',
  async (t) => {
    const mockCDC = createMockCDCService();

    const mockCache = createMockCache({
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
      message_groups: [
        {group_id: 'group-1', replica_count: 3},
      ],
      services: [
        // Only 2 healthy replicas
        {
          service_id: 'service-1',
          node_id: 'node-1',
          group_id: 'group-1',
          service_type: ServiceType.MESSAGE_GROUP_REPLICA,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 'service-2',
          node_id: 'node-2',
          group_id: 'group-1',
          service_type: ServiceType.MESSAGE_GROUP_REPLICA,
          status: ReplicaStatus.ACTIVE,
        },
      ],
      partitions: [],
    });

    const service = new ReplicaRecoveryService({
      nodeId: 'test-node',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCDC,
    });
    service.initialize();

    const events = [];
    service.on('replicaCreated', (e) => events.push(e));

    await service.checkReplicaCounts();

    t.equal(events.length, 1, 'should emit replicaCreated event');
    t.equal(events[0].type, 'message_group', 'should be message_group type');
    t.equal(events[0].groupId, 'group-1', 'should have correct groupId');

    // Check CDC operation
    const insertOps = mockCDC.operations.filter((op) =>
      op.type === 'insert' && op.tableName === SystemTableName.SERVICES,
    );
    t.equal(insertOps.length, 1, 'should have one insert operation');
    t.equal(insertOps[0].data.service_type, ServiceType.MESSAGE_GROUP_REPLICA,
      'should create message group replica');
    t.equal(insertOps[0].data.group_id, 'group-1',
      'should have correct group_id');
    t.end();
  });

test('ReplicaRecoveryService - no recovery when replica count is sufficient',
  async (t) => {
    const mockCDC = createMockCDCService();

    const mockCache = createMockCache({
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      partitions: [
        {partition_id: 'partition-1', table_id: 'table-1', replica_count: 3},
      ],
      services: [
        // All 3 replicas healthy
        {
          service_id: 'service-1',
          node_id: 'node-1',
          partition_id: 'partition-1',
          service_type: ServiceType.PARTITION_REPLICA,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 'service-2',
          node_id: 'node-2',
          partition_id: 'partition-1',
          service_type: ServiceType.PARTITION_REPLICA,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 'service-3',
          node_id: 'node-3',
          partition_id: 'partition-1',
          service_type: ServiceType.PARTITION_REPLICA,
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const service = new ReplicaRecoveryService({
      nodeId: 'test-node',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCDC,
    });
    service.initialize();

    await service.checkReplicaCounts();

    t.equal(mockCDC.operations.length, 0, 'should not create any replicas');
    t.end();
  });

test('ReplicaRecoveryService - prefers nodes without existing replicas', async (t) => {
  const mockCDC = createMockCDCService();

  const mockCache = createMockCache({
    nodes: [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE}, // No replica yet
    ],
    partitions: [
      {partition_id: 'partition-1', table_id: 'table-1', replica_count: 3},
    ],
    services: [
      // Only 2 replicas on node-1 and node-2
      {
        service_id: 'service-1',
        node_id: 'node-1',
        partition_id: 'partition-1',
        service_type: ServiceType.PARTITION_REPLICA,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: 'service-2',
        node_id: 'node-2',
        partition_id: 'partition-1',
        service_type: ServiceType.PARTITION_REPLICA,
        status: ReplicaStatus.ACTIVE,
      },
    ],
  });

  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  await service.checkReplicaCounts();

  // Check that replica was created on node-3 (the one without a replica)
  const insertOps = mockCDC.operations.filter((op) =>
    op.type === 'insert' && op.tableName === SystemTableName.SERVICES,
  );
  t.equal(insertOps.length, 1, 'should have one insert operation');
  t.equal(insertOps[0].data.node_id, 'node-3',
    'should create replica on node without existing replica');
  t.end();
});

test('ReplicaRecoveryService - handles no healthy nodes', async (t) => {
  const mockCDC = createMockCDCService();

  const mockCache = createMockCache({
    nodes: [
      {node_id: 'node-1', status: NodeStatus.FAILED},
      {node_id: 'node-2', status: NodeStatus.FAILED},
    ],
    partitions: [
      {partition_id: 'partition-1', table_id: 'table-1', replica_count: 3},
    ],
    services: [],
  });

  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  await service.checkReplicaCounts();

  t.equal(mockCDC.operations.length, 0,
    'should not create replicas when no healthy nodes');
  t.end();
});

test('ReplicaRecoveryService - getStats', async (t) => {
  const mockCache = createMockCache();
  const mockCDC = createMockCDCService();

  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();

  const stats = service.getStats();

  t.equal(stats.nodeId, 'test-node', 'should have nodeId');
  t.ok(stats.checkIntervalMs > 0, 'should have checkIntervalMs');
  t.equal(stats.minPartitionReplicas, 3, 'should have minPartitionReplicas');
  t.equal(stats.minMessageGroupReplicas, 3, 'should have minMessageGroupReplicas');
  t.equal(stats.pendingRecoveries, 0, 'should have no pending recoveries');
  t.equal(stats.recoveryCount, 0, 'should have zero recovery count');
  t.equal(stats.isRunning, false, 'should not be running');
  t.equal(stats.initialized, true, 'should be initialized');
  t.end();
});

test('ReplicaRecoveryService - shutdown', async (t) => {
  const mockCache = createMockCache();
  const mockCDC = createMockCDCService();

  const service = new ReplicaRecoveryService({
    nodeId: 'test-node',
    systemTableCache: mockCache,
    cdcIntegrationService: mockCDC,
  });
  service.initialize();
  service.start();

  t.equal(service.isRunning(), true, 'should be running');

  service.shutdown();

  t.equal(service.isRunning(), false, 'should not be running');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('ReplicaRecoveryService - NodeStatus values', async (t) => {
  t.equal(NodeStatus.ACTIVE, 'active', 'should have active');
  t.equal(NodeStatus.SUSPECTED, 'suspected', 'should have suspected');
  t.equal(NodeStatus.FAILED, 'failed', 'should have failed');
  t.equal(NodeStatus.RECOVERING, 'recovering', 'should have recovering');
  t.end();
});

test('ReplicaRecoveryService - ReplicaStatus values', async (t) => {
  t.equal(ReplicaStatus.ACTIVE, 'active', 'should have active');
  t.equal(ReplicaStatus.INACTIVE, 'inactive', 'should have inactive');
  t.equal(ReplicaStatus.FAILED, 'failed', 'should have failed');
  t.equal(ReplicaStatus.STARTING, 'starting', 'should have starting');
  t.equal(ReplicaStatus.STOPPING, 'stopping', 'should have stopping');
  t.end();
});

test('ReplicaRecoveryService - ServiceType values', async (t) => {
  t.equal(ServiceType.PARTITION_REPLICA, 'partition',
    'should have partition');
  t.equal(ServiceType.MESSAGE_GROUP_REPLICA, 'message_group',
    'should have message_group');
  t.end();
});
