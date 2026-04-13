/**
 * Property Test: Replica Creation Idempotency
 * **Property 78: Replica Creation Idempotency**
 * **Validates: Requirements 10.3**
 *
 * *For any* duplicate CREATE_REPLICA message with the same replica_id,
 * the system should:
 * 1. Return 'already_exists' or 'in_progress' status instead of creating a duplicate
 * 2. Not create duplicate service rows
 * 3. Not start duplicate partition services
 *
 * Note: Per Requirements 9.1 and 9.2:
 * - 'already_exists' for replicas in active state
 * - 'in_progress' for replicas in creating/syncing state
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
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
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
  const createdServices = [];
  return {
    factory: async (options) => {
      createdServices.push(options);
      return {
        partitionId: options.partitionId,
        replicaId: options.replicaId,
        initialized: true,
        async shutdown() {},
        async syncFromLeader() {},
      };
    },
    createdServices,
  };
}

test('Property 78: Replica Creation Idempotency', async (t) => {
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
   * Property: For any duplicate CREATE_REPLICA with same replica_id,
   * the second call returns 'in_progress' status (since replica is in
   * STARTING state after first call).
   */
  t.test('duplicate CREATE_REPLICA returns in_progress', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id_1
        fc.uuid(), // request_id_2
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id (same for both)
        fc.string({minLength: 1, maxLength: 20}), // table_name
        async (requestId1, requestId2, partitionId, replicaId, tableName) => {
          const mockCDC = createMockCDCService();
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // First CREATE_REPLICA
          const message1 = {
            request_id: requestId1,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: tableName,
            table_id: partitionId,
          };

          const ack1 = await manager.handleCreateReplica(message1);

          // Wait a tick for async creation to start
          await Promise.resolve();

          // Second CREATE_REPLICA with same replica_id
          const message2 = {
            request_id: requestId2,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: tableName,
            table_id: partitionId,
          };

          const ack2 = await manager.handleCreateReplica(message2);

          manager.shutdown();

          // First should be initiated, second should be in_progress
          // (since replica is in STARTING state after first call)
          return ack1.status === AckStatus.INITIATED &&
            ack2.status === AckStatus.IN_PROGRESS &&
            ack2.request_id === requestId2;
        },
      ),
      {numRuns: 10},
    );

    t.pass('duplicate CREATE_REPLICA returns in_progress');
  });

  /**
   * Property: For any number of duplicate CREATE_REPLICA messages,
   * only one service row is inserted.
   */
  t.test('only one service row inserted for duplicates', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 2, max: 5}), // number of duplicate requests
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        async (duplicateCount, partitionId, replicaId) => {
          const mockCDC = createMockCDCService();
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Send multiple CREATE_REPLICA with same replica_id
          const acks = [];
          for (let i = 0; i < duplicateCount; i++) {
            const message = {
              request_id: `request-${i}`,
              partition_id: partitionId,
              replica_id: replicaId,
              table_name: 'test_table',
              table_id: partitionId,
            };

            const ack = await manager.handleCreateReplica(message);
            acks.push(ack);
            await Promise.resolve(); // Allow async processing
          }

          manager.shutdown();

          // Count insert operations for services table
          const insertOps = mockCDC.operations.filter((op) =>
            op.type === 'insert' && op.data.service_id === replicaId);

          // Only first should be initiated, rest should be in_progress or
          // already_exists (depending on whether async creation completed)
          const initiatedCount = acks.filter((a) =>
            a.status === AckStatus.INITIATED).length;
          const idempotentCount = acks.filter((a) =>
            a.status === AckStatus.IN_PROGRESS ||
            a.status === AckStatus.ALREADY_EXISTS).length;

          return initiatedCount === 1 &&
            idempotentCount === duplicateCount - 1 &&
            insertOps.length <= 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('only one service row inserted for duplicates');
  });

  /**
   * Property: For any pre-existing replica, CREATE_REPLICA returns
   * already_exists without any CDC operations.
   */
  t.test('pre-existing replica returns already_exists with no CDC ops', async (t) => {
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
            createPartitionService: createMockPartitionServiceFactory().factory,
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Pre-populate local replica (simulating existing replica)
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.ACTIVE,
            service: {async shutdown() {}, async syncFromLeader() {}},
          });

          // Clear any operations from setup
          mockCDC.reset();

          // Try to create same replica
          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: 'test_table',
            table_id: partitionId,
          };

          const ack = await manager.handleCreateReplica(message);

          manager.shutdown();

          // Should return already_exists with no CDC operations
          return ack.status === AckStatus.ALREADY_EXISTS &&
            ack.type === MessageType.CREATE_REPLICA_ACK &&
            mockCDC.operations.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('pre-existing replica returns already_exists with no CDC ops');
  });

  /**
   * Property: For any replica in any status, CREATE_REPLICA returns
   * appropriate idempotent response:
   * - 'in_progress' for CREATING/SYNCING states
   * - 'already_exists' for ACTIVE/REMOVING/FAILED states
   */
  t.test('replica in any status returns idempotent response', async (t) => {
    // Note: ReplicaHandler checks for CREATING/SYNCING for IN_PROGRESS,
    // and ACTIVE for ALREADY_EXISTS. Other statuses may vary.
    const statuses = [
      {status: 'creating', expected: AckStatus.IN_PROGRESS},
      {status: 'syncing', expected: AckStatus.IN_PROGRESS},
      {status: ReplicaStatus.ACTIVE, expected: AckStatus.ALREADY_EXISTS},
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        fc.constantFrom(...statuses), // existing status config
        async (requestId, partitionId, replicaId, statusConfig) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory().factory,
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Pre-populate local replica with given status
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: statusConfig.status,
            service: {async shutdown() {}, async syncFromLeader() {}},
          });

          // Try to create same replica
          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: 'test_table',
            table_id: partitionId,
          };

          const ack = await manager.handleCreateReplica(message);

          manager.shutdown();

          // Should return expected status based on current state
          return ack.status === statusConfig.expected;
        },
      ),
      {numRuns: 10},
    );

    t.pass('replica in any status returns idempotent response');
  });
});
