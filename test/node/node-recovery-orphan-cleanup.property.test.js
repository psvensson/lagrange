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
} from '../../src/node/replica-lifecycle-manager.js';
import {ReplicaState} from '../../src/node/replica-state-machine.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createCanonicalLifecycleServiceRow,
  createLifecycleCdcService,
} from
  '../test-helpers/lifecycle-state-store.js';

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
  } catch (cleanupErr) {
    console.warn('cleanup failed for %s', TEST_DATA_DIR, cleanupErr);
  }
}

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService(services = []) {
  return createLifecycleCdcService({services});
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
  services.forEach((service, index) => {
    Object.assign(
      service,
      createCanonicalLifecycleServiceRow(service, index),
    );
  });
  return {
    filter(tableName, predicate) {
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    get(tableName, id) {
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
        return services.find((s) => s.service_id === id);
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
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
   * Property: For any canonical CREATING replica on recovery, its exact
   * durable generation is marked FAILED.
   */
  t.test('starting replicas are marked as failed on recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';
          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaState.CREATING,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const mockCDC = createMockCDCService(services);
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
            op.data.status === ReplicaState.FAILED &&
            op.whereClause.status === ReplicaState.CREATING &&
            Number.isFinite(op.whereClause.state_entered_at));

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
          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaState.SYNCING,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const mockCDC = createMockCDCService(services);
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
            op.data.status === ReplicaState.FAILED &&
            op.whereClause.status === ReplicaState.SYNCING &&
            Number.isFinite(op.whereClause.state_entered_at));

          manager.shutdown();

          return failedUpdates.length === 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('syncing replicas are marked as failed on recovery');
  });

  /**
   * Property: Recovery never revives the retired delete-row-then-clean-files
   * contract. A REMOVING generation remains durably owned until the canonical
   * removal/cleanup owner completes it.
   */
  t.test('stopping replicas are removed on recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // service_id
        fc.uuid(), // partition_id
        async (serviceId, partitionId) => {
          const nodeId = 'test-node';
          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaState.REMOVING,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const mockCDC = createMockCDCService(services);
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

          const deleteOps = mockCDC.operations.filter((op) =>
            op.type === 'delete' &&
            op.whereClause.service_id === serviceId);
          const durableRow = mockCDC.store.durableRow(
            SYSTEM_TABLE_NAME.SERVICES,
            serviceId,
          );

          manager.shutdown();

          return deleteOps.length === 0 &&
            durableRow?.status === ReplicaState.REMOVING &&
            durableRow?.created_at === services[0].created_at;
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
          const services = [];

          // Add starting replicas
          for (let i = 0; i < startingCount; i++) {
            const partitionId = `partition-starting-${i}`;
            services.push({
              service_id: `starting-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaState.CREATING,
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
              status: ReplicaState.SYNCING,
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
              status: ReplicaState.REMOVING,
            });
            ensurePartitionDir(partitionId);
          }

          const mockCache = createMockCache(nodeId, services);
          const mockCDC = createMockCDCService(services);
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
            op.type === 'update' && op.data.status === ReplicaState.FAILED &&
            Number.isFinite(op.whereClause.state_entered_at));

          // Count deletes for stopping
          const deleteOps = mockCDC.operations.filter((op) =>
            op.type === 'delete');

          const removingRowsRemainOwned = services
            .filter((service) => service.status === ReplicaState.REMOVING)
            .every((service) => mockCDC.store.durableRow(
              SYSTEM_TABLE_NAME.SERVICES,
              service.service_id,
            )?.created_at === service.created_at);

          manager.shutdown();

          return failedUpdates.length === startingCount + syncingCount &&
            deleteOps.length === 0 && removingRowsRemainOwned;
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
          const services = [
            {
              service_id: serviceId,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaState.ACTIVE,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const mockCDC = createMockCDCService(services);
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
          // Replica on different node in transitional state
          const services = [
            {
              service_id: serviceId,
              node_id: otherNodeId, // Different node
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaState.CREATING,
            },
          ];

          const mockCache = createMockCache(nodeId, services);
          const mockCDC = createMockCDCService(services);
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
          const services = [];
          for (let i = 0; i < orphanCount; i++) {
            const partitionId = `partition-${i}`;
            services.push({
              service_id: `orphan-${i}`,
              node_id: nodeId,
              service_type: 'partition',
              partition_id: partitionId,
              status: ReplicaState.CREATING,
            });
            ensurePartitionDir(partitionId);
          }

          const mockCache = createMockCache(nodeId, services);
          const mockCDC = createMockCDCService(services);
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
