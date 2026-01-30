/**
 * Multi-node cluster integration tests.
 * Tests node joining, leaving, replica rebalancing, and message routing.
 * Requirements: 1.4, 7.12, 7.13
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService, NodeStatus} from '../../src/node/node-service.js';
import {NodeJoiningService, JoiningPhase} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {UnifiedRebalancer, EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {DEFAULT_TABLE_POLICY} from '../../src/policy/policy-constants.js';
import {URL} from 'url';

function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: pathname,
      payload: body,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`HTTP ${res.statusCode}: ${res.payload}`);
    }
    return res.json();
  };
}

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
      periodicCheckIntervalMs: 1000,
      periodicCheckJitterMs: 100,
    },
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
async function cleanupTestEnvironment() {
  await NodeService.getInstance().shutdown().catch(() => {});
  await ServiceThreadManager.getInstance().shutdown().catch(() => {});
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

function createMockCDCIntegrationService(systemTableCache) {
  return {
    async insertSystemTableRow(tableName, data) {
      systemTableCache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      systemTableCache.applySystemTableChange(
        tableName,
        'UPDATE',
        {...whereClause, ...data},
      );
      return {success: true};
    },
    async upsertSystemTableRow(tableName, data) {
      systemTableCache.applySystemTableChange(tableName, 'UPSERT', data);
      return {success: true};
    },
  };
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

test('Multi-node cluster integration tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('node joining - new node contacts seed and joins cluster', async (t) => {
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
    let seedApi;
    let joiningService;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      // Create joining service for new node (must use valid UUID)
      // wsPort is required for WebSocket server to enable Raft message routing
      const joiningNodeId = '550e8400-e29b-41d4-a716-446655440002';
      const joiningWsPort = 18090;
      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 2000,
          leadershipWaitInitialDelayMs: 50,
          leadershipWaitMaxDelayMs: 500,
        },
        httpPost,
      });

      // Track joining phases
      const phases = [];
      joiningService.on('phaseStart', (data) => phases.push(data.phase));

      // Execute join
      const result = await joiningService.join();

      t.equal(result.success, true, 'join should succeed');
      t.equal(joiningService.getPhase(), JoiningPhase.COMPLETE, 'should be complete');
      t.ok(result.messageGroupServices.size > 0, 'should have message group services');
      t.ok(phases.includes(JoiningPhase.CONTACTING_SEED), 'should contact seed');
      t.ok(phases.includes(JoiningPhase.WAITING_LEADERSHIP), 'should wait for leadership');
    } finally {
      if (joiningService) {
        await joiningService.cleanup().catch(() => {});
      }
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService && bootstrapService.shutdown) {
        await bootstrapService.shutdown().catch(() => {});
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch(() => {});
      }
    }
  });

  await t.test('node joining - rejects duplicate node ID from cache', async (t) => {
    const cache = new SystemTableCache();
    const existingNodeId = '550e8400-e29b-41d4-a716-446655440002';
    const existingNodeAddress = 'ws://localhost:9090';
    const now = Date.now();

    cache.applySystemTableChange('nodes', 'INSERT', {
      node_id: existingNodeId,
      node_address: existingNodeAddress,
      cpu_cores: 4,
      memory_mb: 1024,
      disk_gb: 10,
      cpu_usage_percent: 0,
      memory_usage_percent: 0,
      disk_usage_percent: 0,
      status: 'active',
      ws_connection_state: 'ready',
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 1000,
      created_at: now,
    });

    const seedApi = new BootstrapAPI({
      seedNodeId: '550e8400-e29b-41d4-a716-446655440001',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: cache,
      messageGroupServices: new Map(),
    });

    await seedApi.initialize(0, {listen: false});
    const httpPost = createInProcHttpPost(seedApi);

    const joiningService = new NodeJoiningService({
      nodeId: existingNodeId,
      nodeAddress: existingNodeAddress,
      seedNodeAddress: 'http://localhost:0',
      wsPort: 9090,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 500,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 50,
      },
      httpPost,
    });

    const result = await joiningService.join();

    t.equal(result.success, false, 'join should fail for duplicate node ID');
    t.equal(joiningService.getPhase(), JoiningPhase.FAILED, 'phase should be failed');
    t.ok(result.error.includes('already registered'),
      'error should mention already registered');

    await joiningService.cleanup();
    await seedApi.shutdown();
  });

  await t.test('node leaving - services are stopped and cleaned up', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'leaving-node-1'});

    // Start some services
    await nodeService.startService({id: 'svc-1', type: 'partition'});
    await nodeService.startService({id: 'svc-2', type: 'messageGroup'});

    t.equal(nodeService.getAllServices().length, 2, 'should have 2 services');
    t.equal(nodeService.hasLocalMessageGroupReplica(), true, 'should have MG replica');

    // Shutdown node (simulates leaving)
    await nodeService.shutdown();

    t.equal(nodeService.isInitialized(), false, 'should not be initialized');
    t.equal(nodeService.getStatus(), NodeStatus.STOPPED, 'should be stopped');
  });

  await t.test('replica rebalancing - triggers on node join', async (t) => {
    // Create system table cache with initial state
    const cache = new SystemTableCache();
    const readyLeaseExpiresAt = Date.now() + 10000;
    cache.applySystemTableChange('nodes', 'INSERT', {
      id: 'node-1',
      node_id: 'node-1',
      status: 'active',
      cpu_usage_percent: 20,
      memory_usage_percent: 30,
      ws_connection_state: 'ready',
      ready_lease_expires_at: readyLeaseExpiresAt,
    });
    cache.applySystemTableChange('nodes', 'INSERT', {
      id: 'node-2',
      node_id: 'node-2',
      status: 'active',
      cpu_usage_percent: 25,
      memory_usage_percent: 35,
      ws_connection_state: 'ready',
      ready_lease_expires_at: readyLeaseExpiresAt,
    });

    // Create rebalancer for a partition
    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      systemTableCache: cache,
      cdcIntegrationService: createMockCDCIntegrationService(cache),
      tablePolicyService: createMockTablePolicyService(),
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator: createMockRebalanceCoordinator(),
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    // Track rebalancing events
    const events = [];
    rebalancer.on('addReplica', (data) => events.push({type: 'add', ...data}));
    rebalancer.on('removeReplica', (data) => events.push({type: 'remove', ...data}));

    // Trigger rebalance
    const result = await rebalancer.rebalance('node_join');

    t.equal(result.success, true, 'rebalance should succeed');
    t.ok(Array.isArray(result.moves), 'should have moves array');

    // Cleanup
    rebalancer.shutdown();
  });

  await t.test('message routing - local message delivery', async (t) => {
    const port = 23000;
    const nodeId = 'node-1';
    const router = new MessageRouter({nodeId, wsPort: port});
    const messageGroups = [];

    try {
      await router.initialize({startServer: true});

      // Create 3-replica message group (all on same node for this test)
      const replicaIds = ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'];
      const peerAddresses =
        replicaIds.map((replicaId) => `${nodeId}/message-group/${replicaId}`);

      for (const replicaId of replicaIds) {
        const messageGroup = new MessageGroupService({
          groupId: 'mg-1',
          replicaId,
          nodeId,
          replicaIds,
          peerAddresses,
          transport: router,
        });

        // Register with router using unified address format
        const address = `${nodeId}/message-group/${replicaId}`;
        router.register(address, (envelope) => {
          return messageGroup.receiveMessage(envelope);
        });

        await messageGroup.initialize();
        messageGroups.push(messageGroup);
      }

      // Poll for leader election (should complete within 300ms with fast Raft config)
      let leader = null;
      for (let i = 0; i < 10 && !leader; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        leader = messageGroups.find((mg) => mg.isLeaderReplica());
      }
      t.ok(leader, 'should have elected a leader');

      // Send a message from the leader to a registered target
      // Register a target service handler to receive the message
      const targetAddress = `${nodeId}/service/target-service`;
      let _receivedMessage = null;
      router.register(targetAddress, (envelope) => {
        _receivedMessage = envelope;
        return {acknowledged: true, status: 'received'};
      });

      const result = await leader.sendMessage(targetAddress, {
        action: 'test',
        data: 'hello',
      });

      t.ok(result.messageId, 'should have message ID');
      t.ok(['delivered', 'pending'].includes(result.status.toLowerCase()) ||
           result.deliveryType, 'should have delivery status');

      // Cleanup
      for (const mg of messageGroups) {
        await mg.shutdown();
      }
    } finally {
      await router.shutdown();
    }
  });

  await t.test('message routing - cross-replica communication', async (t) => {
    const port = 23001;
    const nodeId = 'node-1';
    const router = new MessageRouter({nodeId, wsPort: port});
    const replicas = [];

    try {
      await router.initialize({startServer: true});

      // Create 3-replica message group for proper Raft consensus
      const replicaIds = ['mg-cross-r1', 'mg-cross-r2', 'mg-cross-r3'];
      const peerAddresses =
        replicaIds.map((replicaId) => `${nodeId}/message-group/${replicaId}`);

      for (const replicaId of replicaIds) {
        const replica = new MessageGroupService({
          groupId: 'mg-cross',
          replicaId,
          nodeId,
          replicaIds,
          peerAddresses,
          transport: router,
        });

        // Register with router using unified address format
        const address = `${nodeId}/message-group/${replicaId}`;
        router.register(address, (envelope) => replica.receiveMessage(envelope));

        await replica.initialize();
        replicas.push(replica);
      }

      // Poll for leader election (should complete within 300ms with fast Raft config)
      let leader = null;
      for (let i = 0; i < 10 && !leader; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        leader = replicas.find((r) => r.isLeaderReplica());
      }
      t.ok(leader, '3-replica group should elect a leader');

      // Cleanup
      for (const replica of replicas) {
        await replica.shutdown();
      }
    } finally {
      await router.shutdown();
    }
  });

  await t.test('rebalancer - maintains odd replica count', async (t) => {
    const cache = new SystemTableCache();
    const readyLeaseExpiresAt = Date.now() + 10000;

    // Add nodes
    for (let i = 1; i <= 5; i++) {
      cache.applySystemTableChange('nodes', 'INSERT', {
        id: `node-${i}`,
        node_id: `node-${i}`,
        status: 'active',
        cpu_usage_percent: 10 * i,
        memory_usage_percent: 15 * i,
        ws_connection_state: 'ready',
        ready_lease_expires_at: readyLeaseExpiresAt,
      });
    }

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-odd',
      entityType: EntityType.PARTITION,
      systemTableCache: cache,
      cdcIntegrationService: createMockCDCIntegrationService(cache),
      tablePolicyService: createMockTablePolicyService(),
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator: createMockRebalanceCoordinator(),
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    // Test odd count validation
    const policy = rebalancer.getPolicy();
    t.equal(policy.replicaCount % 2, 1, 'default replica count should be odd');

    const validated3 = rebalancer.validateReplicaCount(3, policy);
    t.equal(validated3, 3, 'should keep 3 as is');

    const validated4 = rebalancer.validateReplicaCount(4, policy);
    t.equal(validated4 % 2, 1, 'should adjust 4 to odd');

    const validated5 = rebalancer.validateReplicaCount(5, policy);
    t.equal(validated5, 5, 'should keep 5 as is');

    rebalancer.shutdown();
  });

  await t.test('node service - tracks message group replicas', async (t) => {
    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'mg-tracking-node'});

    // Initially no message groups
    t.equal(nodeService.hasLocalMessageGroupReplica(), false);
    t.equal(nodeService.getLocalMessageGroupReplica(), null);

    // Add message group service
    await nodeService.startService({
      id: 'mg-track-1',
      type: 'messageGroup',
    });

    t.equal(nodeService.hasLocalMessageGroupReplica(), true);
    const mgReplica = nodeService.getLocalMessageGroupReplica();
    t.ok(mgReplica, 'should get MG replica');
    t.equal(mgReplica.id, 'mg-track-1');

    // Add another message group
    await nodeService.startService({
      id: 'mg-track-2',
      type: 'messageGroup',
    });

    // Should still return first active one
    const mgReplica2 = nodeService.getLocalMessageGroupReplica();
    t.ok(mgReplica2, 'should still get MG replica');
  });

  await t.test('bootstrap API - validates node registration', async (t) => {
    const seedApi = new BootstrapAPI({
      seedNodeId: '550e8400-e29b-41d4-a716-446655440010',
      seedNodeAddress: 'ws://localhost:8080',
      messageGroupServices: new Map(),
      systemTableCache: new SystemTableCache(),
    });

    await seedApi.initialize(0, {listen: false});
    const response = await seedApi.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440011',
        nodeAddress: 'ws://localhost:9999',
      },
    });
    const result = JSON.parse(response.payload);
    t.equal(result.success, true, 'valid registration should succeed');
    t.ok(result.messageGroupAssignment, 'should have message group assignment');

    await seedApi.shutdown();
  });
});
