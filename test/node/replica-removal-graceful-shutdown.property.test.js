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
 */

import {test} from 'tap';
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
    reset() {
      operations.length = 0;
    },
  };
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
            cdcIntegrationService: mockCDC,
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
            cdcIntegrationService: mockCDC,
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
   * Property: For any REMOVE_REPLICA, status transitions through
   * stopping -> stopped.
   */
  t.test('removal transitions through stopping to stopped', async (t) => {
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
            cdcIntegrationService: mockCDC,
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
            reason: 'rebalancing',
          };

          // Start removal
          await manager.handleRemoveReplica(message);

          // Wait for async removal to complete
          await new Promise((resolve) => {
            manager.once('replicaRemoved', resolve);
            // Timeout fallback
            setTimeout(resolve, 100);
          });

          // Check status updates in CDC operations
          const statusUpdates = mockCDC.operations.filter((op) =>
            op.type === 'update' && op.data.status);

          const stoppingUpdate = statusUpdates.find((op) =>
            op.data.status === ReplicaStatus.STOPPING);
          const stoppedUpdate = statusUpdates.find((op) =>
            op.data.status === ReplicaStatus.STOPPED);

          manager.shutdown();

          // Should have both stopping and stopped updates
          return stoppingUpdate !== undefined && stoppedUpdate !== undefined;
        },
      ),
      {numRuns: 10},
    );

    t.pass('removal transitions through stopping to stopped');
  });

  /**
   * Property: For any REMOVE_REPLICA, graceful shutdown is called on service.
   */
  t.test('graceful shutdown is called on service', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        async (requestId, partitionId, replicaId) => {
          const mockCDC = createMockCDCService();
          const {service, tracker} = createMockPartitionService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            cdcIntegrationService: mockCDC,
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
            reason: 'rebalancing',
          };

          // Start removal
          await manager.handleRemoveReplica(message);

          // Wait for async removal to complete
          await new Promise((resolve) => {
            manager.once('replicaRemoved', resolve);
            setTimeout(resolve, 100);
          });

          manager.shutdown();

          return tracker.shutdownCalled === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('graceful shutdown is called on service');
  });

  /**
   * Property: For any REMOVE_REPLICA, service row is deleted after shutdown.
   */
  t.test('service row is deleted after shutdown', async (t) => {
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
            cdcIntegrationService: mockCDC,
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
            reason: 'rebalancing',
          };

          // Start removal
          await manager.handleRemoveReplica(message);

          // Wait for async removal to complete
          await new Promise((resolve) => {
            manager.once('replicaRemoved', resolve);
            setTimeout(resolve, 100);
          });

          // Check for delete operation
          const deleteOps = mockCDC.operations.filter((op) =>
            op.type === 'delete' &&
            op.whereClause.service_id === replicaId);

          manager.shutdown();

          return deleteOps.length === 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('service row is deleted after shutdown');
  });

  /**
   * Property: For any REMOVE_REPLICA, replica is removed from local tracking.
   */
  t.test('replica is removed from local tracking', async (t) => {
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
            cdcIntegrationService: mockCDC,
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

          const existsBefore = manager.localReplicas.has(replicaId);

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          // Start removal
          await manager.handleRemoveReplica(message);

          // Wait for async removal to complete
          await new Promise((resolve) => {
            manager.once('replicaRemoved', resolve);
            setTimeout(resolve, 100);
          });

          const existsAfter = manager.localReplicas.has(replicaId);

          manager.shutdown();

          return existsBefore === true && existsAfter === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('replica is removed from local tracking');
  });

  /**
   * Property: For any REMOVE_REPLICA, replicaRemoved event is emitted.
   */
  t.test('replicaRemoved event is emitted', async (t) => {
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
            cdcIntegrationService: mockCDC,
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

          let emittedEvent = null;
          manager.on('replicaRemoved', (event) => {
            emittedEvent = event;
          });

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason,
          };

          // Start removal
          await manager.handleRemoveReplica(message);

          // Wait for async removal to complete
          await new Promise((resolve) => setTimeout(resolve, 100));

          manager.shutdown();

          return emittedEvent !== null &&
            emittedEvent.requestId === requestId &&
            emittedEvent.replicaId === replicaId &&
            emittedEvent.partitionId === partitionId &&
            emittedEvent.reason === reason;
        },
      ),
      {numRuns: 10},
    );

    t.pass('replicaRemoved event is emitted');
  });
});
