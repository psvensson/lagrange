/**
 * Tests for Bootstrap Sequence.
 * Verifies the ordering: server → self-connect → services
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {WORK_CLASS} from '../../src/runtime/work-class-scheduler.js';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-bootstrap-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  // Reset NodeService for clean test state
  NodeService.resetInstance();
}

// Get a random available port
function getRandomPort() {
  return 10000 + Math.floor(Math.random() * 50000);
}

test('Bootstrap sequence - server starts before services', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  // Track phase order
  const phaseOrder = [];
  bootstrap.on('phaseStart', ({phase}) => {
    phaseOrder.push(phase);
  });

  try {
    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');
    t.ok(result.messageRouter, 'should have messageRouter');

    // Verify phase order
    t.equal(phaseOrder[0], 'infrastructure', 'infrastructure should be first phase');
    t.ok(phaseOrder.indexOf('infrastructure') < phaseOrder.indexOf('message_groups'),
      'infrastructure should come before message_groups');
    t.ok(phaseOrder.indexOf('infrastructure') < phaseOrder.indexOf('partitions'),
      'infrastructure should come before partitions');

    // Verify server is running
    t.ok(result.messageRouter.server, 'WebSocket server should be running');

    // Verify self-connection is established
    t.ok(result.messageRouter.hasSelfConnection(),
      'self-connection should be established');
  } finally {
    await bootstrap.shutdown();
  }
});

test('BootstrapService - executePhase routes work through class A scheduler', async (t) => {
  initializeTestEnvironment();

  const scheduledClasses = [];
  const scheduler = {
    enqueue: async (workClass, task) => {
      scheduledClasses.push(workClass);
      return task();
    },
  };

  const bootstrap = new BootstrapService({
    nodeId: 'bootstrap-scheduler-node',
    nodeAddress: 'ws://localhost:12000',
    wsPort: 12000,
    workClassScheduler: scheduler,
  });

  await bootstrap.executePhase('infrastructure', async () => {});

  t.same(scheduledClasses, [WORK_CLASS.A],
    'bootstrap phase execution should run through class A scheduler');
  await bootstrap.shutdown();
});

test('BootstrapService - activates message-group rows after seed registration',
  async (t) => {
    initializeTestEnvironment();

    const order = [];
    const bootstrap = new BootstrapService({
      nodeId: 'bootstrap-activate-node',
      nodeAddress: 'ws://localhost:12001',
      wsPort: 12001,
    });

    bootstrap.phaseInfrastructure = async () => {
      order.push('infrastructure');
    };
    bootstrap.phaseMessageGroups = async () => {
      order.push('message-groups');
    };
    bootstrap.phasePartitions = async () => {
      order.push('partitions');
    };
    bootstrap.phaseRegistration = async () => {
      order.push('registration');
    };
    bootstrap.phaseCacheHydration = async () => {
      order.push('cache-hydration');
    };
    bootstrap.initializeReplicaHandler = () => {
      order.push('replica-handler');
    };
    bootstrap.initializeMessageGroupServiceHandler = () => {
      order.push('message-group-handler');
      bootstrap.messageGroupServiceHandlerRegistered = true;
    };
    bootstrap.initializeControlPlaneService = async () => {
      order.push('control-plane');
    };
    bootstrap.registerSeedNodeWithControlPlane = async () => {
      order.push('seed-registration');
      bootstrap.messageGroupServiceEndpointsPublished = true;
    };
    bootstrap.activateMessageGroupServiceRows = async () => {
      order.push('activate-message-group-rows');
    };
    bootstrap.initializeRuntimeServiceHandler = () => {
      order.push('runtime-handler');
    };
    bootstrap.startLatencyTopologyLifecycle = () => {
      order.push('latency-topology');
    };
    bootstrap.activateControlPlaneBackgroundWriters = () => {
      order.push('background-writers');
    };
    bootstrap.logger = {
      info() {},
      debug() {},
      warn() {},
      error() {},
    };

    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');
    t.equal(
      bootstrap.messageGroupServiceEndpointsPublished,
      true,
      'bootstrap should mark endpoint publication complete before activation',
    );
    t.ok(
      order.indexOf('message-group-handler') <
        order.indexOf('seed-registration'),
      'handler registration should complete before seed control-plane registration',
    );
    t.ok(
      order.indexOf('seed-registration') <
        order.indexOf('activate-message-group-rows'),
      'message-group rows should activate after seed control-plane registration',
    );
  });

test('Bootstrap sequence - self-connection established before services', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  let selfConnectionBeforeServices = false;

  // Check self-connection status when message_groups phase starts
  bootstrap.on('phaseStart', ({phase}) => {
    if (phase === 'message_groups') {
      // At this point, infrastructure phase is complete
      // Self-connection should already be established
      selfConnectionBeforeServices = bootstrap.messageRouter &&
        bootstrap.messageRouter.hasSelfConnection();
    }
  });

  try {
    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');
    t.ok(selfConnectionBeforeServices,
      'self-connection should be established before services are created');
  } finally {
    await bootstrap.shutdown();
  }
});

test('Bootstrap sequence - services created after self-connection', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  try {
    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');

    // Verify services were created
    t.ok(result.messageGroupServices.size > 0, 'message group services should be created');
    t.ok(result.partitionServices.size > 0, 'partition services should be created');

    // Verify self-connection is still active
    t.ok(result.messageRouter.hasSelfConnection(),
      'self-connection should still be active after services created');
  } finally {
    await bootstrap.shutdown();
  }
});

test('Bootstrap sequence - without wsPort fails (no server)', async (t) => {
  initializeTestEnvironment();

  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: 'ws://localhost:8080',
    // No wsPort - server won't start, leadership can't be established
    // System requires WebSocket-based communication for all messages (even local)
    // per system guidelines: "All nodes will have at least one replica of a message
    // group (liferaft) which will always be used for any communication (even local)"
    config: {
      leadershipWaitTimeoutMs: 100, // Short timeout since it will fail
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  try {
    const result = await bootstrap.bootstrap();

    // Without wsPort, bootstrap should fail because Raft elections require
    // WebSocket communication between replicas, even on the same node.
    t.equal(result.success, false, 'bootstrap should fail without wsPort');
    t.ok(result.error, 'should have error message');
    t.match(result.error, /leadership/i, 'error should mention leadership timeout');
  } finally {
    await bootstrap.shutdown();
  }
});

test('Bootstrap sequence - startWebSocketServer after bootstrap', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  // Bootstrap without wsPort first
  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort, // Set wsPort so startWebSocketServer can use it
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  try {
    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');

    // Server should already be running since wsPort was provided
    t.ok(result.messageRouter.server, 'WebSocket server should be running');
    t.ok(result.messageRouter.hasSelfConnection(),
      'self-connection should be established');

    // Calling startWebSocketServer again should be a no-op
    await bootstrap.startWebSocketServer();

    // Server should still be running
    t.ok(result.messageRouter.server, 'WebSocket server should still be running');
    t.ok(result.messageRouter.hasSelfConnection(),
      'self-connection should still be established');
  } finally {
    await bootstrap.shutdown();
  }
});


test('Bootstrap sequence - epoch manager initialized with partition assignments', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  try {
    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');

    // Verify epoch manager is created
    t.ok(result.epochManager, 'should have epochManager in result');
    t.ok(bootstrap.getEpochManager(), 'getEpochManager() should return the manager');

    // Verify epoch manager is initialized
    const epochManager = result.epochManager;
    t.ok(epochManager.isInitialized(), 'epoch manager should be initialized');

    // Verify initial epoch
    const currentEpoch = epochManager.getCurrentEpoch();
    t.equal(currentEpoch.epoch, 0, 'initial epoch should be 0');
    t.equal(currentEpoch.proposedBy, nodeId, 'epoch should be proposed by seed node');

    // Verify assignments contain partitions
    const assignments = currentEpoch.assignments;
    t.ok(Object.keys(assignments).length > 0, 'should have partition assignments');

    // Verify all assignments point to the seed node
    for (const [partitionId, nodes] of Object.entries(assignments)) {
      t.ok(nodes.includes(nodeId),
        `partition ${partitionId} should be assigned to seed node`);
    }
  } finally {
    await bootstrap.shutdown();
  }
});

test('Bootstrap sequence - epoch manager cleaned up on shutdown', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  const result = await bootstrap.bootstrap();
  t.equal(result.success, true, 'bootstrap should succeed');
  t.ok(bootstrap.getEpochManager(), 'epoch manager should exist before shutdown');

  await bootstrap.shutdown();

  t.equal(bootstrap.getEpochManager(), null, 'epoch manager should be null after shutdown');
});

test('Bootstrap sequence - partition leadership wait fails when no leaders', async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: 'test-node',
    config: {
      leadershipWaitTimeoutMs: 5,
      leadershipWaitInitialDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1,
    },
  });

  bootstrap.partitionServices = new Map([
    ['services-p1-r1', {partitionId: 'services-p1', isLeader: false}],
    ['nodes-p1-r1', {partitionId: 'nodes-p1', isLeader: false}],
  ]);

  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  bootstrap.sleep = async () => {
    now += 10;
  };

  try {
    await bootstrap.waitForPartitionLeadership();
    t.fail('should throw when partition leadership is missing');
  } catch (error) {
    t.match(error.message, /Partition leaders not established within 5ms/,
      'should report leadership timeout');
    t.match(error.message, /services-p1/, 'should list services partition');
    t.match(error.message, /nodes-p1/, 'should list nodes partition');
  } finally {
    Date.now = originalNow;
  }
});
