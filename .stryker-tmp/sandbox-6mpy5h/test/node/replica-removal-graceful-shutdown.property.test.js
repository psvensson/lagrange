/**
 * Property Test: Replica Removal Graceful Shutdown
 * **Property 82: Replica Removal Graceful Shutdown**
 * **Validates: Requirements 10.12, 10.13, 10.14, 10.15, 10.16**
 *
 * *For any* REMOVE_REPLICA operation, the system should:
 * 1. Send immediate ACK with 'initiated' status
 * 2. Update status to 'stopping' before shutdown
 * 3. Call graceful shutdown on the service
 * 4. Update status to 'stopped' after shutdown
 * 5. Delete service row and clean up resources
 *
 * Note: Tests for async completion (steps 2-5) require filesystem setup
 * and are covered in integration tests. This file tests synchronous behavior.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaLifecycleManager,
  ReplicaStatus,
  MessageType,
  AckStatus,
} from '../../src/node/replica-lifecycle-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data, timestamp: Date.now()});
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({type: 'update', tableName, whereClause, data, timestamp: Date.now()});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause, timestamp: Date.now()});
      return {success: true};
    },
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data, timestamp: Date.now()});
      return {success: true};
    },
    reset() {
      operations.length = 0;
    },
  };
}

/**
 * Create a mock system table cache.
 * @return {Object} Mock system table cache.
 */
function createMockSystemTableCache() {
  return {
    filter: (_tableName, _predicate) => [],
    get: (_tableName, _key) => null,
    set: (_tableName, _key, _value) => {},
  };
}

/**
 * Create a mock partition service factory.
 * @return {Function} Factory function.
 */
function createMockPartitionServiceFactory() {
  return async (options) => ({
    partitionId: options.partitionId,
    replicaId: options.replicaId,
    initialized: true,
    async shutdown() {},
    async syncFromLeader() {},
  });
}

/**
 * Create a mock partition service with shutdown tracking.
 * @return {Object} Mock service with tracking.
 */
function createMockPartitionService() {
  const tracker = {
    shutdownCalled: false,
    shutdownCalledAt: null,
  };

  const service = {
    async shutdown() {
      tracker.shutdownCalled = true;
      tracker.shutdownCalledAt = Date.now();
    },
    async syncFromLeader() {},
  };

  return {service, tracker};
}

test('Property 82: Replica Removal Graceful Shutdown', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property: For any REMOVE_REPLICA on existing replica, ACK is returned
   * with 'initiated' status.
   */
  t.test('REMOVE_REPLICA returns initiated ACK', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        fc.string({minLength: 1, maxLength: 20}), // reason
        async (requestId, partitionId, replicaId, reason) => {
          const mockCDC = createMockCDCService();
          const {service} = createMockPartitionService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Pre-populate local replica
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.ACTIVE,
            service,
          });

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason,
          };

          const ack = await manager.handleRemoveReplica(message);

          manager.shutdown();

          return ack.type === MessageType.REMOVE_REPLICA_ACK &&
            ack.status === AckStatus.INITIATED &&
            ack.request_id === requestId &&
            ack.replica_id === replicaId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA returns initiated ACK');
  });

  /**
   * Property: For any REMOVE_REPLICA on non-existent replica, ACK is
   * returned with 'not_found' status.
   */
  t.test('REMOVE_REPLICA on missing replica returns not_found', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        async (requestId, partitionId, replicaId) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // No replica pre-populated

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          const ack = await manager.handleRemoveReplica(message);

          manager.shutdown();

          return ack.type === MessageType.REMOVE_REPLICA_ACK &&
            ack.status === AckStatus.NOT_FOUND &&
            ack.request_id === requestId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA on missing replica returns not_found');
  });

  /**
   * Property: For any REMOVE_REPLICA on replica already being removed,
   * ACK is returned with 'in_progress' status.
   */
  t.test('REMOVE_REPLICA on removing replica returns in_progress', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        async (requestId, partitionId, replicaId) => {
          const mockCDC = createMockCDCService();
          const {service} = createMockPartitionService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Pre-populate local replica with 'removing' status
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: 'removing',
            service,
          });

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          const ack = await manager.handleRemoveReplica(message);

          manager.shutdown();

          return ack.type === MessageType.REMOVE_REPLICA_ACK &&
            ack.status === AckStatus.IN_PROGRESS &&
            ack.request_id === requestId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA on removing replica returns in_progress');
  });
});
