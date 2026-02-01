/**
 * Property Test: Registered Partition Removal Succeeds
 * **Property 2: Registered Partition Removal Succeeds**
 * **Validates: Requirements 1.3**
 *
 * *For any* partition that has been registered with ReplicaLifecycleManager,
 * a REMOVE_REPLICA request for that replica SHALL return status 'initiated'
 * (not 'not_found').
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaLifecycleManager,
  AckStatus,
} from '../../src/node/replica-lifecycle-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  return {
    async insertSystemTableRow() {
      return {success: true};
    },
    async updateSystemTableRow() {
      return {success: true};
    },
    async deleteSystemTableRow() {
      return {success: true};
    },
    async upsertSystemTableRow() {
      return {success: true};
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

test('Property 2: Registered Partition Removal Succeeds', async (t) => {
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
   * Property: For any partition registered with registerExistingReplica,
   * a REMOVE_REPLICA request returns status 'initiated' (not 'not_found').
   */
  t.test('registered partition removal returns initiated status', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // replicaId
        fc.uuid(), // partitionId
        fc.uuid(), // requestId
        fc.string({minLength: 1, maxLength: 30}), // tableName
        async (replicaId, partitionId, requestId, tableName) => {
          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: createMockCDCService(),
            createPartitionService: createMockPartitionServiceFactory(),
          });

          manager.initialize();

          // Register the replica first
          manager.registerExistingReplica({
            replicaId,
            partitionId,
            tableName,
            status: 'active',
          });

          // Send REMOVE_REPLICA request
          const ack = await manager.handleRemoveReplica({
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          });

          manager.shutdown();

          // Invariant: registered partition removal returns 'initiated' status
          return ack.status === AckStatus.INITIATED &&
            ack.request_id === requestId &&
            ack.replica_id === replicaId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('registered partition removal returns initiated status');
  });

  /**
   * Property: For any unregistered replica, a REMOVE_REPLICA request
   * returns status 'not_found'.
   */
  t.test('unregistered partition removal returns not_found status', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // replicaId (not registered)
        fc.uuid(), // partitionId
        fc.uuid(), // requestId
        async (replicaId, partitionId, requestId) => {
          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: createMockCDCService(),
            createPartitionService: createMockPartitionServiceFactory(),
          });

          manager.initialize();

          // Do NOT register the replica - send REMOVE_REPLICA directly
          const ack = await manager.handleRemoveReplica({
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          });

          manager.shutdown();

          // Invariant: unregistered partition removal returns 'not_found' status
          return ack.status === AckStatus.NOT_FOUND &&
            ack.request_id === requestId &&
            ack.replica_id === replicaId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('unregistered partition removal returns not_found status');
  });

  /**
   * Property: For any set of registered partitions, removal of each
   * returns 'initiated' status.
   */
  t.test('multiple registered partitions all return initiated on removal', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            replicaId: fc.uuid(),
            partitionId: fc.uuid(),
            tableName: fc.string({minLength: 1, maxLength: 20}),
          }),
          {minLength: 1, maxLength: 3},
        ),
        async (partitions) => {
          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: createMockCDCService(),
            createPartitionService: createMockPartitionServiceFactory(),
          });

          manager.initialize();

          // Register all partitions
          for (const partition of partitions) {
            manager.registerExistingReplica({
              ...partition,
              status: 'active',
            });
          }

          // Get unique replica IDs
          const uniquePartitions = new Map();
          for (const p of partitions) {
            if (!uniquePartitions.has(p.replicaId)) {
              uniquePartitions.set(p.replicaId, p);
            }
          }

          // Remove each unique partition and verify status
          let allInitiated = true;
          for (const [replicaId, partition] of uniquePartitions) {
            const ack = await manager.handleRemoveReplica({
              request_id: `req-${replicaId}`,
              partition_id: partition.partitionId,
              replica_id: replicaId,
              reason: 'rebalancing',
            });

            if (ack.status !== AckStatus.INITIATED) {
              allInitiated = false;
              break;
            }
          }

          manager.shutdown();

          // Invariant: all registered partitions return 'initiated' on removal
          return allInitiated;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple registered partitions all return initiated on removal');
  });
});
