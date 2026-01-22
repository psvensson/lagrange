/**
 * Property Test: Replica Lifecycle Message Delivery
 * **Property 77: Replica Lifecycle Message Delivery**
 * **Validates: Requirements 10.1, 10.2, 10.10, 10.11, 10.20**
 *
 * *For any* CREATE_REPLICA or REMOVE_REPLICA message, the system should:
 * 1. Send the message to the target node via message groups
 * 2. Receive an immediate ACK with request_id matching
 * 3. Track the pending operation
 * 4. Handle timeout if ACK is not received
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
      operations.push({type: 'insert', tableName, data});
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({type: 'update', tableName, whereClause, data});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      return {success: true};
    },
    reset() {
      operations.length = 0;
    },
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

test('Property 77: Replica Lifecycle Message Delivery', async (t) => {
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
   * Property: For any CREATE_REPLICA message, the handler returns an ACK
   * with the correct request_id and status.
   */
  t.test('CREATE_REPLICA returns ACK with matching request_id', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        fc.string({minLength: 1, maxLength: 20}), // table_name
        async (requestId, partitionId, replicaId, tableName) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: tableName,
            table_id: partitionId,
          };

          const ack = await manager.handleCreateReplica(message);

          manager.shutdown();

          // ACK should have matching request_id
          return ack.request_id === requestId &&
            ack.type === MessageType.CREATE_REPLICA_ACK &&
            (ack.status === AckStatus.INITIATED ||
             ack.status === AckStatus.ALREADY_EXISTS);
        },
      ),
      {numRuns: 10},
    );

    t.pass('CREATE_REPLICA returns ACK with matching request_id');
  });

  /**
   * Property: For any REMOVE_REPLICA message with existing replica,
   * the handler returns an ACK with 'initiated' status.
   */
  t.test('REMOVE_REPLICA returns initiated ACK for existing replica', async (t) => {
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

          // Pre-populate local replica
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.ACTIVE,
            service: {async shutdown() {}},
          });

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          const ack = await manager.handleRemoveReplica(message);

          manager.shutdown();

          // ACK should have matching request_id and initiated status
          return ack.request_id === requestId &&
            ack.type === MessageType.REMOVE_REPLICA_ACK &&
            ack.status === AckStatus.INITIATED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA returns initiated ACK for existing replica');
  });

  /**
   * Property: For any REMOVE_REPLICA message with non-existent replica,
   * the handler returns an ACK with 'not_found' status.
   */
  t.test('REMOVE_REPLICA returns not_found ACK for missing replica', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        async (requestId, partitionId, replicaId) => {
          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          const ack = await manager.handleRemoveReplica(message);

          manager.shutdown();

          // ACK should have not_found status
          return ack.request_id === requestId &&
            ack.type === MessageType.REMOVE_REPLICA_ACK &&
            ack.status === AckStatus.NOT_FOUND;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA returns not_found ACK for missing replica');
  });

  /**
   * Property: For any lifecycle message, the pending operation is tracked
   * with the correct request_id.
   */
  t.test('pending operations are tracked with request_id', async (t) => {
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
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: 'test_table',
            table_id: partitionId,
          };

          await manager.handleCreateReplica(message);

          const pending = manager.getPendingOperation(requestId);

          manager.shutdown();

          // Pending operation should be tracked
          return pending !== null &&
            pending.partition_id === partitionId &&
            pending.replica_id === replicaId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('pending operations are tracked with request_id');
  });
});
