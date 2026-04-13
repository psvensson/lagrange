/**
 * Property Test: Partition Registration Invariant
 * **Property 1: Partition Registration Invariant**
 * **Validates: Requirements 1.1, 1.2**
 *
 * *For any* partition created during bootstrap and registered with
 * ReplicaLifecycleManager, the localReplicas map SHALL contain an entry
 * for that replica_id with correct partition metadata.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaLifecycleManager,
  ReplicaStatus,
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

test('Property 1: Partition Registration Invariant', async (t) => {
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
   * the localReplicas map contains an entry with correct metadata.
   */
  t.test('registered partitions appear in localReplicas with correct metadata', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // replicaId
        fc.uuid(), // partitionId
        fc.string({minLength: 1, maxLength: 30}), // tableName
        fc.constantFrom('active', 'starting', 'syncing'), // status
        (replicaId, partitionId, tableName, status) => {
          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: createMockCDCService(),
            createPartitionService: createMockPartitionServiceFactory(),
          });

          manager.initialize();

          // Register the replica
          manager.registerExistingReplica({
            replicaId,
            partitionId,
            tableName,
            status,
          });

          // Verify the replica is in localReplicas
          const replica = manager.getLocalReplica(replicaId);

          manager.shutdown();

          // Invariant: replica must exist with correct metadata
          return replica !== null &&
            replica.replicaId === replicaId &&
            replica.partitionId === partitionId &&
            replica.tableName === tableName &&
            replica.status === status;
        },
      ),
      {numRuns: 10},
    );

    t.pass('registered partitions appear in localReplicas with correct metadata');
  });

  /**
   * Property: For any partition registered without explicit status,
   * the default status is 'active'.
   */
  t.test('registered partitions default to active status', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // replicaId
        fc.uuid(), // partitionId
        fc.string({minLength: 1, maxLength: 30}), // tableName
        (replicaId, partitionId, tableName) => {
          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: createMockCDCService(),
            createPartitionService: createMockPartitionServiceFactory(),
          });

          manager.initialize();

          // Register without explicit status
          manager.registerExistingReplica({
            replicaId,
            partitionId,
            tableName,
          });

          const replica = manager.getLocalReplica(replicaId);

          manager.shutdown();

          // Invariant: status defaults to 'active'
          return replica !== null &&
            replica.status === ReplicaStatus.ACTIVE;
        },
      ),
      {numRuns: 10},
    );

    t.pass('registered partitions default to active status');
  });

  /**
   * Property: Duplicate registration is idempotent - no error and
   * original data is preserved.
   */
  t.test('duplicate registration is idempotent', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // replicaId
        fc.uuid(), // partitionId
        fc.string({minLength: 1, maxLength: 30}), // tableName
        fc.string({minLength: 1, maxLength: 30}), // secondTableName
        (replicaId, partitionId, tableName, secondTableName) => {
          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: createMockCDCService(),
            createPartitionService: createMockPartitionServiceFactory(),
          });

          manager.initialize();

          // Register first time
          manager.registerExistingReplica({
            replicaId,
            partitionId,
            tableName,
            status: 'active',
          });

          // Register second time with different data
          manager.registerExistingReplica({
            replicaId,
            partitionId: 'different-partition',
            tableName: secondTableName,
            status: 'starting',
          });

          const replica = manager.getLocalReplica(replicaId);

          manager.shutdown();

          // Invariant: original data is preserved (idempotent)
          return replica !== null &&
            replica.partitionId === partitionId &&
            replica.tableName === tableName &&
            replica.status === 'active';
        },
      ),
      {numRuns: 10},
    );

    t.pass('duplicate registration is idempotent');
  });

  /**
   * Property: For any set of partitions registered, all appear in
   * localReplicas with correct count.
   */
  t.test('multiple partitions all registered correctly', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(
          fc.record({
            replicaId: fc.uuid(),
            partitionId: fc.uuid(),
            tableName: fc.string({minLength: 1, maxLength: 20}),
          }),
          {minLength: 1, maxLength: 5},
        ),
        (partitions) => {
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
            manager.registerExistingReplica(partition);
          }

          // Get unique replica IDs (in case of duplicates in generated data)
          const uniqueReplicaIds = new Set(partitions.map((p) => p.replicaId));

          // Verify all unique replicas are registered
          let allFound = true;
          for (const replicaId of uniqueReplicaIds) {
            if (!manager.getLocalReplica(replicaId)) {
              allFound = false;
              break;
            }
          }

          const stats = manager.getStats();

          manager.shutdown();

          // Invariant: all unique replicas are registered
          return allFound && stats.localReplicaCount === uniqueReplicaIds.size;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple partitions all registered correctly');
  });
});
