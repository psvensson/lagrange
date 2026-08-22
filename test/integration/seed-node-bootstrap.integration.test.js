/**
 * Integration test for seed node bootstrap with bootstrap mode.
 * Tests the complete bootstrap flow including direct writes and cache hydration.
 * Validates: Requirements 7.1-7.6, 8.1-8.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  INITIAL_REPLICA_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  META_SERVICE_ID,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  TABLES,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';

/**
 * Initialize test environment with fast Raft elections.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  ServiceThreadManager.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-seed-node'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
    raft: {
      electionTimeoutMinMs: 100,
      electionTimeoutMaxMs: 200,
      heartbeatIntervalMs: 50,
    },
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
async function cleanupTestEnvironment() {
  await NodeService.getInstance().shutdown()
    .catch((err) => console.warn('shutdown failed', err.message));
  await ServiceThreadManager.getInstance().shutdown()
    .catch((err) => console.warn('shutdown failed', err.message));
  await LoggingService.getInstance().shutdown()
    .catch((err) => console.warn('shutdown failed', err.message));
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

const TEST_TIMEOUT_MS = 120000;

test('Seed node bootstrap integration', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('complete bootstrap flow with bootstrap mode', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440001';
    const seedWsPort = 18080;

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Execute bootstrap
      bootstrapResult = await bootstrapService.bootstrap();

      // Verify bootstrap succeeded
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');
      t.ok(bootstrapResult.nodeId, 'should have node ID');
      t.ok(bootstrapResult.messageGroupServices, 'should have message group services');
      t.ok(bootstrapResult.partitionServices, 'should have partition services');

      // Get CDC integration service to verify bootstrap mode was used
      const cdcService = bootstrapService.cdcIntegrationService;
      t.ok(cdcService, 'should have CDC integration service');

      // Verify bootstrap mode is now disabled (Requirement 8.4)
      t.equal(
        cdcService.bootstrapMode,
        false,
        'bootstrap mode should be disabled after bootstrap',
      );
      t.equal(
        cdcService.localPartitionServices,
        null,
        'local partition services should be cleared',
      );

      // Get system cache to verify it was populated
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      t.ok(systemTableCache, 'should have system table cache');

      // Verify cache was populated with system table data (Requirement 7.3, 7.4)
      const nodes = systemTableCache.getAll(TABLES.NODES);
      t.ok(Array.isArray(nodes), 'nodes table should be in cache');
      t.ok(nodes.length > 0, 'nodes table should have entries');

      const seedNode = nodes.find((n) => n.node_id === seedNodeId);
      t.ok(seedNode, 'seed node should be in nodes table');
      t.equal(seedNode.node_id, seedNodeId, 'seed node ID should match');

      const partitions = systemTableCache.getAll(TABLES.PARTITIONS);
      t.ok(Array.isArray(partitions), 'partitions table should be in cache');
      t.ok(partitions.length > 0, 'partitions table should have entries');

      const services = systemTableCache.getAll(TABLES.SERVICES);
      t.ok(Array.isArray(services), 'services table should be in cache');
      t.ok(services.length > 0, 'services table should have entries');

      const serviceDefinitions = systemTableCache.getAll(
        TABLES.SERVICE_DEFINITIONS,
      );
      t.ok(Array.isArray(serviceDefinitions),
        'service_definitions table should be in cache');
      t.ok(
        serviceDefinitions.some((row) => row.service_id === META_SERVICE_ID.WASM_META),
        'service_definitions should include sys-wasm-meta',
      );
      t.ok(
        serviceDefinitions.some((row) => row.service_id === META_SERVICE_ID.ADMIN_META),
        'service_definitions should include sys-admin-meta',
      );
      const serviceEndpoints = systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS);
      t.ok(Array.isArray(serviceEndpoints),
        'service_endpoints table should be in cache');
      t.ok(
        serviceEndpoints.some((row) =>
          row.service_id === META_SERVICE_ID.WASM_META &&
            row.node_id === seedNodeId),
        'service_endpoints should include sys-wasm-meta endpoint placement',
      );
      t.ok(
        serviceEndpoints.some((row) =>
          row.service_id === META_SERVICE_ID.ADMIN_META &&
            row.node_id === seedNodeId),
        'service_endpoints should include sys-admin-meta endpoint placement',
      );

      const tables = systemTableCache.getAll(TABLES.TABLES);
      t.ok(Array.isArray(tables), 'tables table should be in cache');
      t.ok(tables.length > 0, 'tables table should have entries');

      const messageGroups = systemTableCache.getAll(TABLES.MESSAGE_GROUPS);
      t.ok(Array.isArray(messageGroups), 'message_groups table should be in cache');
      t.ok(messageGroups.length > 0, 'message_groups table should have entries');

      // Verify system tables are registered in tables table
      const systemTableNames = [
        SYSTEM_TABLE_NAME.NODES,
        SYSTEM_TABLE_NAME.PARTITIONS,
        SYSTEM_TABLE_NAME.SERVICES,
        SYSTEM_TABLE_NAME.TABLES,
        SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      ];

      for (const tableName of systemTableNames) {
        const tableEntry = tables.find((t) => t.table_name === tableName);
        t.ok(tableEntry, `${tableName} should be registered in tables table`);
      }

      // Verify partitions are registered for all system tables
      for (const tableName of systemTableNames) {
        const tablePartitions = partitions.filter((p) => p.table_name === tableName);
        t.ok(
          tablePartitions.length > 0,
          `${tableName} should have partitions registered`,
        );
      }

      // Verify services are registered for all partitions
      for (const partition of partitions) {
        const partitionServices = services.filter(
          (s) => s.partition_id === partition.partition_id,
        );
        t.ok(
          partitionServices.length > 0,
          `partition ${partition.partition_id} should have services registered`,
        );
      }
    } finally {
      // Cleanup (includes control plane + router shutdown)
      if (bootstrapService) {
        await bootstrapService.shutdown().catch((err) => console.warn('shutdown failed', err.message));
      }
    }
  });

  await t.test('bootstrap replica creation goes through unified lifecycle owners',
    async (t) => {
      const seedNodeId = '550e8400-e29b-41d4-a716-446655440009';
      const seedWsPort = 18089;
      const expectedMessageGroupCreates = INITIAL_MESSAGE_GROUP_REPLICA_IDS.length;
      const expectedPartitionCreates = Object.values(INITIAL_REPLICA_IDS)
        .reduce((sum, replicaIds) => sum + replicaIds.length, 0);

      const bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: {
          leadershipWaitTimeoutMs: 1000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
      });

      let messageGroupCreateCalls = 0;
      let partitionCreateCalls = 0;
      const originalCreateMessageGroup =
        bootstrapService.seedMessageGroupsPhase
          .createBootstrapMessageGroupReplica
          .bind(bootstrapService.seedMessageGroupsPhase);
      const originalCreatePartition =
        bootstrapService.seedPartitionsPhase
          .createBootstrapPartitionReplica
          .bind(bootstrapService.seedPartitionsPhase);

      bootstrapService.seedMessageGroupsPhase
        .createBootstrapMessageGroupReplica = async (context) => {
          messageGroupCreateCalls++;
          return originalCreateMessageGroup(context);
        };
      bootstrapService.seedPartitionsPhase
        .createBootstrapPartitionReplica = async (context) => {
          partitionCreateCalls++;
          return originalCreatePartition(context);
        };

      try {
        const result = await bootstrapService.bootstrap();
        t.equal(result.success, true, 'bootstrap should succeed');
        t.equal(
          messageGroupCreateCalls,
          expectedMessageGroupCreates,
          'message-group replica creates should flow through lifecycle manager',
        );
        t.equal(
          partitionCreateCalls,
          expectedPartitionCreates,
          'partition replica creates should flow through lifecycle manager',
        );
        t.ok(
          bootstrapService.serviceLifecycleManager,
          'service lifecycle manager should be initialized',
        );
        t.ok(
          bootstrapService.serviceReconciler,
          'service reconciler should be initialized',
        );

        const firstMessageGroupReplicaId = INITIAL_MESSAGE_GROUP_REPLICA_IDS[0];
        const lifecycleState =
          bootstrapService.serviceLifecycleManager.getReplicaState({
            [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: firstMessageGroupReplicaId,
            [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]:
              UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
            [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: seedNodeId,
            [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]:
              firstMessageGroupReplicaId,
          });
        t.equal(
          lifecycleState,
          SERVICE_LIFECYCLE_STATE.RUNNING,
          'lifecycle manager should track running state for bootstrap services',
        );
      } finally {
        await bootstrapService.shutdown().catch((err) => console.warn('shutdown failed', err.message));
      }
    });

  await t.test('direct writes succeed during registration phase', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440002';
    const seedWsPort = 18081;

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;
    let registrationPhaseCompleted = false;

    try {
      // Listen for phase completion events
      bootstrapService.on('phase:complete', (event) => {
        if (event.phase === 'registration') {
          registrationPhaseCompleted = true;
        }
      });

      bootstrapResult = await bootstrapService.bootstrap();

      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');
      t.equal(
        registrationPhaseCompleted,
        true,
        'registration phase should complete',
      );

      // Verify system tables were written during registration
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const services = systemTableCache.getAll(TABLES.SERVICES);
      t.ok(services.length > 0, 'services should be registered');

      const partitions = systemTableCache.getAll(TABLES.PARTITIONS);
      t.ok(partitions.length > 0, 'partitions should be registered');

      const tables = systemTableCache.getAll(TABLES.TABLES);
      t.ok(tables.length > 0, 'tables should be registered');
    } finally {
      // Cleanup (includes control plane + router shutdown)
      if (bootstrapService) {
        await bootstrapService.shutdown().catch((err) => console.warn('shutdown failed', err.message));
      }
    }
  });

  await t.test('writes after bootstrap route through SQL engine', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440003';
    const seedWsPort = 18082;

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      const cdcService = bootstrapService.cdcIntegrationService;
      t.ok(cdcService, 'should have CDC integration service');

      // Verify bootstrap mode is disabled (Requirement 8.5)
      t.equal(
        cdcService.bootstrapMode,
        false,
        'bootstrap mode should be disabled after bootstrap',
      );

      // Attempt to write to system table after bootstrap
      // This should route through SQL engine, not direct partition write
      const result = await cdcService.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
        node_id: 'test-node-after-bootstrap',
        node_address: 'ws://localhost:9999',
        status: 'ACTIVE',
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      t.ok(result.success, 'write after bootstrap should succeed');

      // Verify the write went through SQL engine by checking cache
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const nodes = systemTableCache.getAll(TABLES.NODES);
      const newNode = nodes.find((n) => n.node_id === 'test-node-after-bootstrap');
      t.ok(newNode, 'new node should be in cache after write');
    } finally {
      // Cleanup (includes control plane + router shutdown)
      if (bootstrapService) {
        await bootstrapService.shutdown().catch((err) => console.warn('shutdown failed', err.message));
      }
    }
  });

  await t.test('seed node can bootstrap without system cache', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440004';
    const seedWsPort = 18083;

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;

    try {
      // Before bootstrap, system cache should be empty
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const nodesBefore = systemTableCache.getAll(TABLES.NODES);
      t.ok(
        !nodesBefore || nodesBefore.length === 0,
        'cache should be empty before bootstrap',
      );

      // Bootstrap should succeed even with empty cache (Requirement 7.1, 8.1)
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed with empty cache');

      // After bootstrap, cache should be populated (Requirement 7.5)
      const nodesAfter = systemTableCache.getAll(TABLES.NODES);
      t.ok(nodesAfter.length > 0, 'cache should be populated after bootstrap');
    } finally {
      // Cleanup (includes control plane + router shutdown)
      if (bootstrapService) {
        await bootstrapService.shutdown().catch((err) => console.warn('shutdown failed', err.message));
      }
    }
  });

  await t.test('cache is populated after hydration phase', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440005';
    const seedWsPort = 18084;

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        leadershipWaitTimeoutMs: 1000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        replicaStaggerDelayMs: 20,
      },
    });

    let bootstrapResult;
    let cacheHydrationCompleted = false;

    try {
      // Listen for cache hydration phase completion
      bootstrapService.on('phase:complete', (event) => {
        if (event.phase === 'cache_hydration') {
          cacheHydrationCompleted = true;
        }
      });

      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');
      t.equal(
        cacheHydrationCompleted,
        true,
        'cache hydration phase should complete',
      );

      // Verify cache contains complete cluster state (Requirement 7.4, 7.5)
      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      const nodes = systemTableCache.getAll(TABLES.NODES);
      t.ok(nodes.length > 0, 'cache should have nodes');

      const partitions = systemTableCache.getAll(TABLES.PARTITIONS);
      t.ok(partitions.length > 0, 'cache should have partitions');

      const services = systemTableCache.getAll(TABLES.SERVICES);
      t.ok(services.length > 0, 'cache should have services');

      const tables = systemTableCache.getAll(TABLES.TABLES);
      t.ok(tables.length > 0, 'cache should have tables');

      const messageGroups = systemTableCache.getAll(TABLES.MESSAGE_GROUPS);
      t.ok(messageGroups.length > 0, 'cache should have message groups');

      // Verify cache contains seed node
      const seedNode = nodes.find((n) => n.node_id === seedNodeId);
      t.ok(seedNode, 'cache should contain seed node');
    } finally {
      // Cleanup (includes control plane + router shutdown)
      if (bootstrapService) {
        await bootstrapService.shutdown().catch((err) => console.warn('shutdown failed', err.message));
      }
    }
  });
});
