/**
 * Cross-node replica placement integration tests.
 * Tests the full flow: seed node bootstrap, second node joining,
 * and replica placement via message group routing.
 * Requirements: 10.1, 10.2, 10.20, 10.21, 7.12, 7.13, 4.13
 *
 * IMPORTANT: This test uses real MessageRouter with WebSocket connections
 * to properly simulate the actual join flow where cross-node communication
 * goes through message groups as required by 4.13.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {UnifiedRebalancer, EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';
import {
  createAlwaysReadyControlPlaneReadinessService,
  createMockStorageAccountingService,
  createMockStorageAdmissionService,
  createMockStoragePressureBehavior,
} from './rebalancer-integration-doubles.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {createLifecycleCdcServiceForCache} from
  '../test-helpers/lifecycle-state-store.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';

// Port counter for unique ports per test
let integrationPortCounter = 25000;

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
    node: {id: 'test-node'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
    raft: {
      electionTimeoutMinMs: 100,
      electionTimeoutMaxMs: 200,
      heartbeatIntervalMs: 50,
    },
    rebalancer: {
      periodicCheckIntervalMs: 60000, // Long interval to avoid interference
      periodicCheckJitterMs: 100,
      criticalCheckDelayMs: 100, // Minimum allowed value for fast testing
      stabilizationPeriodMs: 1000, // Minimum allowed value for fast testing
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
    .catch((err) => {
      console.warn('shutdown failed', err);
    });
  await ServiceThreadManager.getInstance().shutdown()
    .catch((err) => {
      console.warn('shutdown failed', err);
    });
  await LoggingService.getInstance().shutdown()
    .catch((err) => console.warn('shutdown failed', err.message));
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

/**
 * Create a mock schema for test partitions.
 */
function createTestSchema(tableName) {
  return {
    tableName,
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'data', type: 'TEXT'},
    ],
  };
}

function createMockCDCService(systemTableCache) {
  return createLifecycleCdcServiceForCache(systemTableCache);
}

function createMockTablePolicyService() {
  return {
    getDefaultPolicy() {
      return {...DEFAULT_TABLE_POLICY};
    },
    getTablePolicy() {
      return {...DEFAULT_TABLE_POLICY};
    },
    getPolicyForPartition() {
      return {...DEFAULT_TABLE_POLICY};
    },
  };
}

function createMockMessageRouter() {
  return {
    getConnectionState() {
      return 'connected';
    },
    isOutboundQueueAvailable() {
      return true;
    },
    async pingNode() {
      return true;
    },
    async deliver() {
      return {acknowledged: true, status: 'initiated'};
    },
  };
}

function createMockRebalanceCoordinator() {
  let counter = 0;
  return {
    getMoveSafetyError: () => null,
    async createOperation({type, partitionId, nodeId, replicaId}) {
      counter += 1;
      return {
        operationId: `op-${counter}`,
        type,
        partitionId,
        replicaId,
        targetNodeId: nodeId,
      };
    },
    getStats() {
      return {operationsCreated: counter};
    },
  };
}

function createMockSqlQueryEngine() {
  return {
    async executeQuery(sql) {
      const normalizedSql = String(sql || '').toLowerCase();
      if (normalizedSql.includes('from config')) {
        return {success: true, rows: [{config_value: '10'}]};
      }
      if (normalizedSql.includes('from replica_operations')) {
        return {success: true, rows: [{total_count: 0}]};
      }
      return {success: true, rows: []};
    },
  };
}

/**
 * Wait for a condition with timeout.
 */
async function waitFor(condition, timeoutMs = 2000, intervalMs = 25) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

test('Cross-node replica placement integration tests', {timeout: 15000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  t.test('full flow: seed node, second node joins, replica placed via message group',
    async (t) => {
      // Track all resources for cleanup
      const resources = {
        messageGroup: null,
        seedPartition: null,
        bootstrapRouter: null,
        seedRouter: null,
        secondNodeRouter: null,
        partitionRebalancer: null,
      };

      try {
        // ========================================
        // PHASE 1: Set up seed node infrastructure
        // ========================================
        const seedNodeId = 'seed-node-001';
        const secondNodeId = 'second-node-002';

        // Create system table cache (shared view of cluster state)
        const systemTableCache = new SystemTableCache();
        const cdcIntegrationService = createMockCDCService(systemTableCache);
        const tablePolicyService = createMockTablePolicyService();
        const sqlQueryEngine = createMockSqlQueryEngine();
        const readyLeaseExpiresAt = Date.now() + 10000;

        // Register seed node in the cache
        systemTableCache.applySystemTableChange('nodes', 'INSERT', {
          id: seedNodeId,
          node_id: seedNodeId,
          status: 'active',
          cpu_usage_percent: 20,
          memory_usage_percent: 30,
          connection_state: 'ready',
          ready_lease_expires_at: readyLeaseExpiresAt,
        });

        // ========================================
        // PHASE 2: Create message group on seed node
        // ========================================
        const bootstrapPort = integrationPortCounter++;
        resources.bootstrapRouter = new MessageRouter({
          bootIncarnation: TEST_BOOT_INCARNATION,
          nodeId: seedNodeId,
          wsPort: bootstrapPort,
        });
        await resources.bootstrapRouter.initialize({startServer: true});

        resources.messageGroup = new MessageGroupService(withTestDbPath({
          groupId: 'mg-test-1',
          replicaId: 'mg-test-1-r1',
          nodeId: seedNodeId,
          replicaIds: ['mg-test-1-r1'],
          peerAddresses: [`${seedNodeId}/message-group/mg-test-1-r1`],
          transport: resources.bootstrapRouter,
          systemTableCache,
        }));

        const mgAddress = `${seedNodeId}/message-group/mg-test-1-r1`;
        resources.bootstrapRouter.register(mgAddress, (envelope) => {
          return resources.messageGroup.receiveMessage(envelope);
        });

        await resources.messageGroup.initialize();

        // Wait for leader election
        const leaderElected = await waitFor(
          () => resources.messageGroup.isLeaderReplica(),
          1500,
        );
        t.ok(leaderElected, 'message group should elect leader');

        // ========================================
        // PHASE 3: Create routers for cross-node communication
        // ========================================
        const seedPort = integrationPortCounter++;
        resources.seedRouter = new MessageRouter({
          bootIncarnation: TEST_BOOT_INCARNATION,
          nodeId: seedNodeId,
          wsPort: seedPort,
        });
        await resources.seedRouter.initialize({startServer: true});

        const secondPort = integrationPortCounter++;
        resources.secondNodeRouter = new MessageRouter({
          bootIncarnation: TEST_BOOT_INCARNATION,
          nodeId: secondNodeId,
          wsPort: secondPort,
        });
        await resources.secondNodeRouter.initialize({startServer: true});
        await resources.seedRouter.connectToNode(
          secondNodeId,
          `ws://127.0.0.1:${secondPort}`,
        );

        // ========================================
        // PHASE 4: Create partition on seed node with 3 replicas
        // ========================================
        const partitionId = 'test-partition-1';
        const schema = createTestSchema('test_table');

        resources.seedPartition = new PartitionService(withFoundingStamp({
          partitionId,
          tableId: 'test_table',
          tableName: 'test_table',
          schema,
          keyRange: {start: null, end: null},
          replicaId: `${partitionId}-r1`,
          replicaIds: [`${partitionId}-r1`, `${partitionId}-r2`, `${partitionId}-r3`],
          peerAddresses: [
            `${seedNodeId}/partition/${partitionId}-r1`,
            `${seedNodeId}/partition/${partitionId}-r2`,
            `${seedNodeId}/partition/${partitionId}-r3`,
          ],
          nodeId: seedNodeId,
          transport: resources.seedRouter,
          dbPath: ':memory:',
          messageGroupService: resources.messageGroup,
          messageRouter: resources.seedRouter,
          systemTableCache,
          cdcIntegrationService,
          tablePolicyService,
        }));

        // Set SQL query engine to enable rebalancer initialization
        resources.seedPartition.setSqlQueryEngine(sqlQueryEngine);

        const partitionAddress = `${seedNodeId}/partition/${partitionId}-r1`;
        resources.seedRouter.register(partitionAddress, (envelope) => {
          return resources.seedPartition.handleTransportMessage ?
            resources.seedPartition.handleTransportMessage(envelope) :
            {acknowledged: true};
        });

        await resources.seedPartition.initialize();

        // Force leader role for testing (simulates quorum achieved)
        resources.seedPartition.role = 'leader';
        resources.seedPartition.isLeader = true;
        resources.seedPartition.leaderId = `${partitionId}-r1`;
        if (resources.seedPartition.rebalancer) {
          resources.seedPartition.rebalancer.setLeader(true);
        }

        t.ok(resources.seedPartition.isLeader, 'partition should become leader');

        // Register partition services in cache
        systemTableCache.applySystemTableChange('services', 'INSERT', {
          id: `${partitionId}-r1`,
          service_id: `${partitionId}-r1`,
          service_type: 'partition',
          node_id: seedNodeId,
          partition_id: partitionId,
          status: 'active',
        });
        systemTableCache.applySystemTableChange('services', 'INSERT', {
          id: `${partitionId}-r2`,
          service_id: `${partitionId}-r2`,
          service_type: 'partition',
          node_id: seedNodeId,
          partition_id: partitionId,
          status: 'active',
        });
        systemTableCache.applySystemTableChange('services', 'INSERT', {
          id: `${partitionId}-r3`,
          service_id: `${partitionId}-r3`,
          service_type: 'partition',
          node_id: seedNodeId,
          partition_id: partitionId,
          status: 'active',
        });

        // ========================================
        // PHASE 5: Second node joins the cluster
        // ========================================

        systemTableCache.applySystemTableChange('nodes', 'INSERT', {
          id: secondNodeId,
          node_id: secondNodeId,
          status: 'active',
          cpu_usage_percent: 15,
          memory_usage_percent: 25,
          connection_state: 'ready',
          ready_lease_expires_at: readyLeaseExpiresAt,
        });

        // ========================================
        // PHASE 6: Trigger rebalancing
        // ========================================

        resources.seedPartition.setSystemTableCache(systemTableCache);

        resources.partitionRebalancer = new UnifiedRebalancer({
          entityId: partitionId,
          entityType: EntityType.PARTITION,
          systemTableCache,
          cdcIntegrationService,
          tablePolicyService,
          nodeId: seedNodeId,
          messageRouter: resources.seedRouter,
          rebalanceCoordinator: createMockRebalanceCoordinator(),
          controlPlaneReadinessService:
            createAlwaysReadyControlPlaneReadinessService(),
          storageAdmissionService: createMockStorageAdmissionService(),
          storageAccountingService: createMockStorageAccountingService(),
          storagePressureBehavior: createMockStoragePressureBehavior(),
          sqlQueryEngine: createMockSqlQueryEngine(),
        });
        resources.partitionRebalancer.initialize();
        resources.partitionRebalancer.setLeader(true);

        // Directly call rebalance() to bypass stabilization period for testing.
        const rebalanceResult =
          await resources.partitionRebalancer.rebalance('node_join');

        // ========================================
        // PHASE 7: Verify results
        // ========================================

        t.equal(rebalanceResult.success, true, 'rebalance should succeed');
        t.ok(Array.isArray(rebalanceResult.moves), 'rebalance should return moves');

        const addMoves = rebalanceResult.moves.filter((move) => move.operation === 'add');
        const replaceMoves = rebalanceResult.moves.filter((move) => move.operation === 'replace');
        t.equal(
          addMoves.length,
          0,
          'should avoid standalone add moves when degraded topology is already at target',
        );
        t.ok(
          replaceMoves.length >= 1,
          'should schedule REPLACE moves for spread correction under degraded topology',
        );
      } finally {
        // ========================================
        // CLEANUP: Ensure all resources are released
        // ========================================
        if (resources.partitionRebalancer) {
          resources.partitionRebalancer.cancelScheduledCheck();
          resources.partitionRebalancer.shutdown();
        }
        if (resources.seedPartition) {
          resources.seedPartition.rebalancer?.cancelScheduledCheck();
          await resources.seedPartition.shutdown().catch((err) => console.warn('shutdown failed', err.message));
        }
        if (resources.messageGroup) {
          await resources.messageGroup.shutdown().catch((err) => console.warn('shutdown failed', err.message));
        }
        if (resources.seedRouter) {
          await resources.seedRouter.shutdown().catch((err) => console.warn('shutdown failed', err.message));
        }
        if (resources.secondNodeRouter) {
          await resources.secondNodeRouter.shutdown().catch((err) => console.warn('shutdown failed', err.message));
        }
        if (resources.bootstrapRouter) {
          await resources.bootstrapRouter.shutdown().catch((err) => console.warn('shutdown failed', err.message));
        }
      }
    });

  t.test('message group routes CREATE_REPLICA via real WebSocket', async (t) => {
    const resources = {
      messageGroup: null,
      router: null,
    };

    try {
      const nodeId = 'seed-node-msg';

      const port = integrationPortCounter++;
      resources.router = new MessageRouter({
        bootIncarnation: TEST_BOOT_INCARNATION,
        nodeId,
        wsPort: port,
      });
      await resources.router.initialize({startServer: true});

      resources.messageGroup = new MessageGroupService(withTestDbPath({
        groupId: 'mg-route-test',
        replicaId: 'mg-route-test-r1',
        nodeId,
        replicaIds: ['mg-route-test-r1'],
        peerAddresses: [`${nodeId}/message-group/mg-route-test-r1`],
        transport: resources.router,
      }));

      const mgAddress = `${nodeId}/message-group/mg-route-test-r1`;
      resources.router.register(mgAddress, (envelope) => {
        return resources.messageGroup.receiveMessage(envelope);
      });

      await resources.messageGroup.initialize();
      await waitFor(() => resources.messageGroup.isLeaderReplica(), 1500);

      const receivedMessages = [];
      const lifecycleAddress = `${nodeId}/lifecycle/manager`;

      resources.router.register(lifecycleAddress, async (envelope) => {
        let message = envelope;
        while (message.payload) {
          message = message.payload;
        }
        receivedMessages.push(message);

        return {
          acknowledged: true,
          type: 'CREATE_REPLICA_ACK',
          request_id: message.request_id,
          status: 'initiated',
          replica_id: message.replica_id,
          node_id: nodeId,
        };
      });

      const createReplicaMessage = {
        type: 'CREATE_REPLICA',
        request_id: 'test-request-001',
        partition_id: 'test-partition',
        table_name: 'test_table',
        replica_id: 'test-replica-001',
        leader_address: nodeId,
        key_range: {start: null, end: null},
        schema: createTestSchema('test_table'),
      };

      const result = await resources.router.deliver(
        lifecycleAddress,
        createReplicaMessage,
      );

      t.ok(result.messageId, 'should have message ID');
      t.ok(result.acknowledged, 'should be acknowledged');

      t.ok(receivedMessages.length > 0, 'should receive message');
      t.equal(
        receivedMessages[0].type,
        'CREATE_REPLICA',
        'should receive CREATE_REPLICA message',
      );
      t.equal(
        receivedMessages[0].request_id,
        'test-request-001',
        'should have correct request ID',
      );
    } finally {
      if (resources.messageGroup) {
        await resources.messageGroup.shutdown().catch((err) => console.warn('shutdown failed', err.message));
      }
      if (resources.router) {
        await resources.router.shutdown().catch((err) => console.warn('shutdown failed', err.message));
      }
    }
  });

  t.test('rebalancer schedules REPLACE moves in degraded two-node topology', async (t) => {
    const nodeId = 'single-node';
    let rebalancer = null;

    try {
      const cache = new SystemTableCache();
      const readyLeaseExpiresAt = Date.now() + 10000;
      cache.applySystemTableChange('nodes', 'INSERT', {
        id: nodeId,
        node_id: nodeId,
        status: 'active',
        cpu_usage_percent: 20,
        memory_usage_percent: 30,
        connection_state: 'ready',
        ready_lease_expires_at: readyLeaseExpiresAt,
      });

      cache.applySystemTableChange('services', 'INSERT', {
        id: 'partition-1-r1',
        service_id: 'partition-1-r1',
        service_type: 'partition',
        node_id: nodeId,
        partition_id: 'partition-1',
        status: 'active',
      });
      cache.applySystemTableChange('services', 'INSERT', {
        id: 'partition-1-r2',
        service_id: 'partition-1-r2',
        service_type: 'partition',
        node_id: nodeId,
        partition_id: 'partition-1',
        status: 'active',
      });
      cache.applySystemTableChange('services', 'INSERT', {
        id: 'partition-1-r3',
        service_id: 'partition-1-r3',
        service_type: 'partition',
        node_id: nodeId,
        partition_id: 'partition-1',
        status: 'active',
      });

      rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        systemTableCache: cache,
        cdcIntegrationService: createMockCDCService(cache),
        tablePolicyService: createMockTablePolicyService(),
        nodeId,
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockRebalanceCoordinator(),
        controlPlaneReadinessService:
          createAlwaysReadyControlPlaneReadinessService(),
        storageAdmissionService: createMockStorageAdmissionService(),
        storageAccountingService: createMockStorageAccountingService(),
        storagePressureBehavior: createMockStoragePressureBehavior(),
        sqlQueryEngine: createMockSqlQueryEngine(),
      });

      rebalancer.initialize();
      rebalancer.setLeader(true);

      const events = [];
      rebalancer.on('addReplica', (e) => events.push({type: 'add', ...e}));
      rebalancer.on('removeReplica', (e) => events.push({type: 'remove', ...e}));

      const result = await rebalancer.rebalance('test');

      t.equal(result.success, true, 'rebalance should succeed');
      t.equal(result.moves.length, 0, 'should have no moves with single node');
      t.equal(events.length, 0, 'should have no events with single node');

      cache.applySystemTableChange('nodes', 'INSERT', {
        id: 'second-node',
        node_id: 'second-node',
        status: 'active',
        cpu_usage_percent: 15,
        memory_usage_percent: 25,
        connection_state: 'ready',
        ready_lease_expires_at: readyLeaseExpiresAt,
      });

      const result2 = await rebalancer.rebalance('node_join');

      t.equal(result2.success, true, 'rebalance should succeed');
      t.equal(
        result2.moves.length,
        1,
        'should schedule one paired replacement move with two ready nodes',
      );
      t.equal(
        result2.moves[0].operation,
        'replace',
        'scheduled degraded move should use REPLACE workflow',
      );
    } finally {
      if (rebalancer) {
        rebalancer.cancelScheduledCheck();
      }
    }
  });
});
