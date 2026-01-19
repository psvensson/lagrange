/**
 * Multi-node cluster integration tests.
 * Tests node joining, leaving, replica rebalancing, and message routing.
 * Requirements: 1.4, 7.12, 7.13
 */

import {test} from 'tap';
import {NodeService, NodeStatus} from '../../src/node/node-service.js';
import {NodeJoiningService, JoiningPhase} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {InMemoryTransport} from '../../src/transport/in-memory-transport.js';
import {UnifiedRebalancer, EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';

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

test('Multi-node cluster integration tests', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  t.test('node joining - new node contacts seed and joins cluster', async (t) => {
    // Start seed node API
    const seedApi = new BootstrapAPI({
      seedNodeId: '550e8400-e29b-41d4-a716-446655440001',
      seedNodeAddress: 'ws://localhost:8080',
      messageGroupServices: new Map(),
    });

    await seedApi.initialize(0);
    const port = seedApi.getFastify().server.address().port;

    // Create joining service for new node (must use valid UUID)
    const joiningService = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440002',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: `http://localhost:${port}`,
      config: {
        httpTimeoutMs: 5000,
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 50,
        leadershipWaitMaxDelayMs: 500,
      },
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

    // Cleanup
    await joiningService.cleanup();
    await seedApi.shutdown();
  });

  t.test('node leaving - services are stopped and cleaned up', async (t) => {
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

  t.test('replica rebalancing - triggers on node join', async (t) => {
    // Create system table cache with initial state
    const cache = new SystemTableCache();
    cache.applySystemTableChange('nodes', 'INSERT', {
      id: 'node-1',
      node_id: 'node-1',
      status: 'active',
      cpu_usage_percent: 20,
      memory_usage_percent: 30,
    });
    cache.applySystemTableChange('nodes', 'INSERT', {
      id: 'node-2',
      node_id: 'node-2',
      status: 'active',
      cpu_usage_percent: 25,
      memory_usage_percent: 35,
    });

    // Create rebalancer for a partition
    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      systemTableCache: cache,
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
    rebalancer.cancelScheduledCheck();
  });

  t.test('message routing - local message delivery', async (t) => {
    const transport = new InMemoryTransport();

    // Create message group service
    const messageGroup = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'node-1',
      replicaIds: ['mg-1-r1'],
      transport,
      isSelfHostedGroup: true,
    });

    // Register with transport
    transport.register('mg-1-r1', (envelope) => {
      return messageGroup.receiveMessage(envelope);
    });

    await messageGroup.initialize();

    // Wait for leader election
    await new Promise((resolve) => setTimeout(resolve, 200));

    t.equal(messageGroup.isLeaderReplica(), true, 'should be leader');

    // Send a message
    const result = await messageGroup.sendMessage('target-service', {
      action: 'test',
      data: 'hello',
    });

    t.ok(result.messageId, 'should have message ID');
    t.ok(['delivered', 'pending'].includes(result.status.toLowerCase()) ||
         result.deliveryType, 'should have delivery status');

    // Cleanup
    await messageGroup.shutdown();
  });

  t.test('message routing - cross-replica communication', async (t) => {
    const transport = new InMemoryTransport();

    // Create two message group replicas
    const replica1 = new MessageGroupService({
      groupId: 'mg-cross',
      replicaId: 'mg-cross-r1',
      nodeId: 'node-1',
      replicaIds: ['mg-cross-r1', 'mg-cross-r2'],
      transport,
      isSelfHostedGroup: true,
    });

    const replica2 = new MessageGroupService({
      groupId: 'mg-cross',
      replicaId: 'mg-cross-r2',
      nodeId: 'node-1',
      replicaIds: ['mg-cross-r1', 'mg-cross-r2'],
      transport,
      isSelfHostedGroup: true,
    });

    // Register both with transport
    transport.register('mg-cross-r1', (envelope) => replica1.receiveMessage(envelope));
    transport.register('mg-cross-r2', (envelope) => replica2.receiveMessage(envelope));

    await replica1.initialize();
    await replica2.initialize();

    // Wait for leader election
    await new Promise((resolve) => setTimeout(resolve, 300));

    // One should be leader
    const hasLeader = replica1.isLeaderReplica() || replica2.isLeaderReplica();
    t.equal(hasLeader, true, 'one replica should be leader');

    // Cleanup
    await replica1.shutdown();
    await replica2.shutdown();
  });

  t.test('rebalancer - maintains odd replica count', async (t) => {
    const cache = new SystemTableCache();

    // Add nodes
    for (let i = 1; i <= 5; i++) {
      cache.applySystemTableChange('nodes', 'INSERT', {
        id: `node-${i}`,
        node_id: `node-${i}`,
        status: 'active',
        cpu_usage_percent: 10 * i,
        memory_usage_percent: 15 * i,
      });
    }

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-odd',
      entityType: EntityType.PARTITION,
      systemTableCache: cache,
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
  });

  t.test('node service - tracks message group replicas', async (t) => {
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

  t.test('bootstrap API - validates node registration', async (t) => {
    const seedApi = new BootstrapAPI({
      seedNodeId: '550e8400-e29b-41d4-a716-446655440010',
      seedNodeAddress: 'ws://localhost:8080',
      messageGroupServices: new Map(),
    });

    await seedApi.initialize(0);
    const port = seedApi.getFastify().server.address().port;

    // Test valid registration with valid UUID
    const response = await fetch(`http://localhost:${port}/bootstrap`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        nodeId: '550e8400-e29b-41d4-a716-446655440011',
        nodeAddress: 'ws://localhost:9999',
      }),
    });

    const result = await response.json();
    t.equal(result.success, true, 'valid registration should succeed');
    t.ok(result.messageGroupAssignment, 'should have message group assignment');

    await seedApi.shutdown();
  });
});
