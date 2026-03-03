/**
 * Unit tests for ReplicaHandler cache-based state access.
 * Tests that ReplicaHandler reads replica state from System_Table_Cache.
 * Requirements: 2.1, 2.2, 2.5
 */

import {test} from '../../src/test-helpers/tap.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';

/**
 * Create a mock CDC integration service.
 * @param {SystemTableCache} [cache] - Optional cache to update.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService(cache) {
  return {
    async insertSystemTableRow(tableName, data) {
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      cache?.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true, operation: 'UPDATE', tableName, whereClause, data: merged};
    },
    async upsertSystemTableRow(tableName, data) {
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'UPSERT', tableName, data};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      cache?.applySystemTableChange(tableName, 'DELETE', whereClause);
      return {success: true, operation: 'DELETE', tableName, whereClause};
    },
  };
}

/**
 * Create a mock partition service factory.
 * @return {Function} Factory function.
 */
function createMockPartitionServiceFactory() {
  return async (options) => {
    return {
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      initialized: true,
      async shutdown() {},
      async syncFromLeader() {},
    };
  };
}

/**
 * Seed a system table cache with minimal required data.
 * @param {Object} options - Seed options.
 * @return {SystemTableCache} Seeded cache.
 */
function createSeededCache(options = {}) {
  const cache = new SystemTableCache();
  const tableId = options.tableId || 'table-1';
  const tableName = options.tableName || 'test_table';
  const partitionId = options.partitionId || 'partition-1';
  const leaderNodeId = options.leaderNodeId || 'leader-node';
  const leaderReplicaId = options.leaderReplicaId || 'leader-replica';
  const schema = options.schema || {
    columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
  };

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify(schema),
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: leaderNodeId,
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: leaderReplicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: leaderNodeId,
    raft_role: 'leader',
    status: ReplicaStatus.ACTIVE,
    address: `${leaderNodeId}/partition/${leaderReplicaId}`,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  return cache;
}

test('ReplicaHandler cache-based state access', async (t) => {
  let tempDir;

  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-handler-cache-test-'));
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  t.test('getLocalReplica reads from cache', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);
    const nodeId = 'test-node';

    // Seed cache with a replica on this node
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: nodeId,
      raft_role: 'follower',
      status: ReplicaStatus.ACTIVE,
      address: `${nodeId}/partition/replica-1`,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const handler = new ReplicaHandler({
      nodeId: nodeId,
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const replica = handler.getLocalReplica('replica-1');

    t.ok(replica, 'replica found');
    t.equal(replica.replicaId, 'replica-1', 'correct replica ID');
    t.equal(replica.status, ReplicaStatus.ACTIVE, 'status from cache');
    t.equal(replica.partitionId, 'partition-1', 'correct partition ID');

    handler.shutdown();
  });

  t.test('getLocalReplica returns null for non-existent replica', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const replica = handler.getLocalReplica('nonexistent');

    t.equal(replica, null, 'returns null for non-existent replica');

    handler.shutdown();
  });

  t.test('getLocalReplica returns null for replica on different node', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    // Seed cache with a replica on a DIFFERENT node
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: 'other-node',
      raft_role: 'follower',
      status: ReplicaStatus.ACTIVE,
      address: 'other-node/partition/replica-1',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const replica = handler.getLocalReplica('replica-1');

    t.equal(replica, null, 'returns null for replica on different node');

    handler.shutdown();
  });

  t.test('registerExistingReplica stores only service reference', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const mockService = {
      partitionId: 'partition-1',
      replicaId: 'replica-1',
      async shutdown() {},
    };

    // Register replica with service
    handler.registerExistingReplica({
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      tableName: 'test_table',
      status: ReplicaStatus.ACTIVE,
      service: mockService,
    });

    // Verify service is stored in localServices
    t.ok(handler.localServices.has('replica-1'), 'service stored in localServices');
    t.equal(handler.localServices.get('replica-1'), mockService, 'correct service reference');

    handler.shutdown();
  });

  t.test('handleCreateReplica idempotency with cache state - ACTIVE', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);
    const nodeId = 'test-node';

    // Seed cache with ACTIVE replica
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: nodeId,
      raft_role: 'follower',
      status: ReplicaStatus.ACTIVE,
      address: `${nodeId}/partition/replica-1`,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const handler = new ReplicaHandler({
      nodeId: nodeId,
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ReplicaOperationResponseStatus.ALREADY_EXISTS,
      'returns ALREADY_EXISTS for ACTIVE replica');

    handler.shutdown();
  });

  t.test('handleCreateReplica idempotency with cache state - CREATING', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);
    const nodeId = 'test-node';

    // Seed cache with CREATING replica
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: nodeId,
      raft_role: 'follower',
      status: ReplicaStatus.CREATING,
      address: `${nodeId}/partition/replica-1`,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const handler = new ReplicaHandler({
      nodeId: nodeId,
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
      'returns IN_PROGRESS for CREATING replica');

    handler.shutdown();
  });

  t.test('handleCreateReplica idempotency with cache state - SYNCING', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);
    const nodeId = 'test-node';

    // Seed cache with SYNCING replica
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: nodeId,
      raft_role: 'follower',
      status: ReplicaStatus.SYNCING,
      address: `${nodeId}/partition/replica-1`,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const handler = new ReplicaHandler({
      nodeId: nodeId,
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
      'returns IN_PROGRESS for SYNCING replica');

    handler.shutdown();
  });

  t.test('getAllLocalReplicas reads from cache', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);
    const nodeId = 'test-node';

    // Seed cache with multiple replicas on this node
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: nodeId,
      raft_role: 'follower',
      status: ReplicaStatus.ACTIVE,
      address: `${nodeId}/partition/replica-1`,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-2',
      service_type: 'partition',
      partition_id: 'partition-2',
      node_id: nodeId,
      raft_role: 'follower',
      status: ReplicaStatus.ACTIVE,
      address: `${nodeId}/partition/replica-2`,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Add a replica on a different node (should not be included)
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-3',
      service_type: 'partition',
      partition_id: 'partition-3',
      node_id: 'other-node',
      raft_role: 'follower',
      status: ReplicaStatus.ACTIVE,
      address: 'other-node/partition/replica-3',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const handler = new ReplicaHandler({
      nodeId: nodeId,
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const replicas = handler.getAllLocalReplicas();

    t.equal(replicas.length, 2, 'returns only replicas on this node');
    t.ok(replicas.some((r) => r.replicaId === 'replica-1'), 'includes replica-1');
    t.ok(replicas.some((r) => r.replicaId === 'replica-2'), 'includes replica-2');
    t.notOk(replicas.some((r) => r.replicaId === 'replica-3'), 'excludes replica on other node');

    handler.shutdown();
  });
});
