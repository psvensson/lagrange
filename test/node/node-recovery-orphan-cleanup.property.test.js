/**
 * Property Test: Node Recovery Orphan Cleanup
 * **Property 83: Node Recovery Orphan Cleanup**
 * **Validates: Requirements 10.26, 10.27, 10.28**
 *
 * *For any* node recovery scenario, the system should:
 * 1. Query services table for replicas in transitional states
 * 2. Mark 'starting'/'syncing' replicas as 'failed'
 * 3. Complete removal for 'stopping' replicas
 * 4. Clean up local resources for orphaned replicas
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import {
  ReplicaLifecycleManager,
  ReplicaStatus,
} from '../../src/node/replica-lifecycle-manager.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const TEST_DATA_DIR = '/tmp/test-lifecycle-recovery';

/**
 * Ensure test directories exist for a partition.
 * @param {string} partitionId - Partition ID.
 */
function ensurePartitionDir(partitionId) {
  const partitionDir = path.join(TEST_DATA_DIR, 'partitions', partitionId);
  fs.mkdirSync(partitionDir, {recursive: true});
}

/**
 * Clean up test directories.
 */
function cleanupTestDirs() {
  try {
    fs.rmSync(TEST_DATA_DIR, {recursive: true, force: true});
  } catch (_e) {
    // Ignore cleanup errors
  }
}

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
 * Create a mock partition service factory.
 * @return {Object} Factory and tracking.
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

/**
 * Create a mock system table cache.
 * @param {string} nodeId - Node ID to filter services.
 * @param {Array} services - Services to include in cache.
 * @return {Object} Mock cache.
 */
function createMockCache(nodeId, services = []) {
  return {
    filter(tableName, predicate) {
      if (tableName === SystemTableName.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    get(tableName, id) {
      if (tableName === SystemTableName.SERVICES) {
        return services.find((s) => s.service_id === id);
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === SystemTableName.SERVICES) {
        return services;
      }
      return [];
    },
  };
}

test('Property 83: Node Recovery Orphan Cleanup', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    // Clean up any leftover test directories
    cleanupTestDirs();
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    cleanupTestDirs();
  });

  /**
   * Property: For any 'starting' replica on recovery, it is marked as 'failed'.
   */
  t.test('starting replicas are marked as failed on recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';
          const mockCDC = createMockCDCService();

          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.STARTING,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const {factory} = createMockPartitionServiceFactory();

          // Create partition directory for cleanup
          ensurePartitionDir(partitionId);

          const manager = new ReplicaLifecycleManager({
            nodeId,
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: TEST_DATA_DIR,
          });

          manager.initialize();

          await manager.handleNodeRecovery();

          // Check that replica was marked as failed
          const failedUpdates = mockCDC.operations.filter((op) =>
            op.type === 'update' &&
            op.whereClause.service_id === serviceId &&
            op.data.status === ReplicaStatus.FAILED);

          manager.shutdown();

          return failedUpdates.length === 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('starting replicas are marked as failed on recovery');
  });

  /**
   * Property: For any 'syncing' replica on recovery, it is marked as 'failed'.
   */
  t.test('syncing replicas are marked as failed on recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';
          const mockCDC = createMockCDCService();

          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.SYNCING,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const {factory} = createMockPartitionServiceFactory();

          // Create partition directory for cleanup
          ensurePartitionDir(partitionId);

          const manager = new ReplicaLifecycleManager({
            nodeId,
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: TEST_DATA_DIR,
          });

          manager.initialize();

          await manager.handleNodeRecovery();

          // Check that replica was marked as failed
          const failedUpdates = mockCDC.operations.filter((op) =>
            op.type === 'update' &&
            op.whereClause.service_id === serviceId &&
            op.data.status === ReplicaStatus.FAILED);

          manager.shutdown();

          return failedUpdates.length === 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('syncing replicas are marked as failed on recovery');
  });

  /**
   * Property: For any 'stopping' replica on recovery, removal is completed.
   */
  t.test('stopping replicas are removed on recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';
          const mockCDC = createMockCDCService();

          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.STOPPING,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const {factory} = createMockPartitionServiceFactory();

          // Create partition directory for cleanup
          ensurePartitionDir(partitionId);

          const manager = new ReplicaLifecycleManager({
            nodeId,
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: TEST_DATA_DIR,
          });

          manager.initialize();

          await manager.handleNodeRecovery();

          // Check that replica was updated to stopped and then deleted
          const stoppedUpdates = mockCDC.operations.filter((op) =>
            op.type === 'update' &&
            op.whereClause.service_id === serviceId &&
            op.data.status === ReplicaStatus.STOPPED);

          const deleteOps = mockCDC.operations.filter((op) =>
            op.type === 'delete' &&
            op.whereClause.service_id === serviceId);

          manager.shutdown();

          return stoppedUpdates.length === 1 && deleteOps.length === 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('stopping replicas are removed on recovery');
  });

  /**
   * Property: For any mix of transitional replicas, all are handled correctly.
   */
  t.test('mixed transitional replicas are all handled', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 3}), // starting count
        fc.integer({min: 1, max: 3}), // syncing count
        fc.integer({min: 1, max: 3}), // stopping count
        async (startingCount, syncingCount, stoppingCount) => {
          const nodeId = 'test-node';
          const mockCDC = createMockCDCService();

          const services = [];

          // Add starting replicas
          for (let i = 0; i < startingCount; i++) {
            const partitionId = `partition-starting-${i}`;
            services.push({
              service_id: `starting-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.STARTING,
            });
            ensurePartitionDir(partitionId);
          }

          // Add syncing replicas
          for (let i = 0; i < syncingCount; i++) {
            const partitionId = `partition-syncing-${i}`;
            services.push({
              service_id: `syncing-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.SYNCING,
            });
            ensurePartitionDir(partitionId);
          }

          // Add stopping replicas
          for (let i = 0; i < stoppingCount; i++) {
            const partitionId = `partition-stopping-${i}`;
            services.push({
              service_id: `stopping-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.STOPPING,
            });
            ensurePartitionDir(partitionId);
          }

          const mockCache = createMockCache(nodeId, services);
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: TEST_DATA_DIR,
          });

          manager.initialize();

          await manager.handleNodeRecovery();

          // Count failed updates for starting/syncing
          const failedUpdates = mockCDC.operations.filter((op) =>
            op.type === 'update' && op.data.status === ReplicaStatus.FAILED);

          // Count stopped updates for stopping
          const stoppedUpdates = mockCDC.operations.filter((op) =>
            op.type === 'update' && op.data.status === ReplicaStatus.STOPPED);

          // Count deletes for stopping
          const deleteOps = mockCDC.operations.filter((op) =>
            op.type === 'delete');

          manager.shutdown();

          return failedUpdates.length === startingCount + syncingCount &&
            stoppedUpdates.length === stoppingCount &&
            deleteOps.length === stoppingCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('mixed transitional replicas are all handled');
  });

  /**
   * Property: Active replicas are not affected by recovery.
   */
  t.test('active replicas are not affected by recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';
          const mockCDC = createMockCDCService();

          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.ACTIVE,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: TEST_DATA_DIR,
          });

          manager.initialize();

          await manager.handleNodeRecovery();

          manager.shutdown();

          // No operations should be performed on active replicas
          return mockCDC.operations.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('active replicas are not affected by recovery');
  });

  /**
   * Property: Replicas on other nodes are not affected by recovery.
   */
  t.test('replicas on other nodes are not affected', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';
          const otherNodeId = 'other-node';
          const mockCDC = createMockCDCService();

          // Replica on different node in transitional state
          const services = [
            {
              service_id: serviceId,
              node_id: otherNodeId, // Different node
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.STARTING,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: TEST_DATA_DIR,
          });

          manager.initialize();

          await manager.handleNodeRecovery();

          manager.shutdown();

          // No operations should be performed on other node's replicas
          return mockCDC.operations.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('replicas on other nodes are not affected');
  });

  /**
   * Property: Recovery emits recoveryComplete event with correct count.
   */
  t.test('recoveryComplete event is emitted with orphan count', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 0, max: 5}), // orphan count
        async (orphanCount) => {
          const nodeId = 'test-node';
          const mockCDC = createMockCDCService();

          const services = [];
          for (let i = 0; i < orphanCount; i++) {
            const partitionId = `partition-${i}`;
            services.push({
              service_id: `orphan-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaStatus.STARTING,
            });
            ensurePartitionDir(partitionId);
          }

          const mockCache = createMockCache(nodeId, services);
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
            dataDir: TEST_DATA_DIR,
          });

          manager.initialize();

          let emittedEvent = null;
          manager.on('recoveryComplete', (event) => {
            emittedEvent = event;
          });

          await manager.handleNodeRecovery();

          manager.shutdown();

          return emittedEvent !== null &&
            emittedEvent.nodeId === nodeId &&
            emittedEvent.orphanedCount === orphanCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('recoveryComplete event is emitted with orphan count');
  });
});
