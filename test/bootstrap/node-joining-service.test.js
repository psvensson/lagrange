/**
 * Tests for Node Joining Service.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {test} from 'tap';
import {
  NodeJoiningService,
  JoiningPhase,
} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {AssignmentStrategy} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('NodeJoiningService - initialization', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  t.equal(service.getPhase(), JoiningPhase.NOT_STARTED);
  t.equal(service.nodeId, 'test-node-1');
  t.equal(service.nodeAddress, 'ws://localhost:9090');
  t.equal(service.seedNodeAddress, 'http://localhost:8080');
});

test('NodeJoiningService - getStatus', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  const status = service.getStatus();

  t.equal(status.nodeId, 'test-node-1');
  t.equal(status.phase, JoiningPhase.NOT_STARTED);
  t.equal(status.messageGroupCount, 0);
  t.equal(status.lastError, null);
});

test('NodeJoiningService - fails without seed node address', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    // No seedNodeAddress
  });

  const result = await service.join();

  t.equal(result.success, false);
  t.ok(result.error.includes('Seed node address'));
  t.equal(service.getPhase(), JoiningPhase.FAILED);
});

test('NodeJoiningService - full join with CREATE_SELF_HOSTED', async (t) => {
  initializeTestEnvironment();

  // Configure faster Raft elections for testing
  const config = ConfigurationManager.getInstance();
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

  // Start a seed node API
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
  });

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19090 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0);
    const port = seedApi.getFastify().server.address().port;

    // Create joining service with wsPort for WebSocket server
    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440010',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: `http://localhost:${port}`,
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
      },
    });

    // Track phase events
    const phases = [];
    service.on('phaseStart', (data) => phases.push(data.phase));

    const result = await service.join();

    // The join should succeed
    t.equal(result.success, true, 'join should succeed');
    t.equal(service.getPhase(), JoiningPhase.COMPLETE, 'phase should be complete');
    t.ok(result.messageGroupServices.size > 0, 'should have message group services');
    t.ok(result.transport, 'should have transport');
    t.ok(
      result.bootstrapResponse.messageGroupAssignment.strategy ===
        AssignmentStrategy.CREATE_SELF_HOSTED,
      'should use CREATE_SELF_HOSTED strategy',
    );

    // Verify phases were executed
    t.ok(phases.includes(JoiningPhase.CONTACTING_SEED), 'should have contacted seed');
    t.ok(
      phases.includes(JoiningPhase.CREATING_MESSAGE_GROUP),
      'should have created message group',
    );
    t.ok(phases.includes(JoiningPhase.WAITING_LEADERSHIP), 'should have waited for leadership');
    t.ok(phases.includes(JoiningPhase.QUERYING_STATE), 'should have queried state');
  } finally {
    // Cleanup in reverse order
    if (service) {
      await service.cleanup();
    }
    await seedApi.shutdown();
  }
});

test('NodeJoiningService - full join with MOVE_REPLICA', async (t) => {
  initializeTestEnvironment();

  // Configure faster Raft elections for testing
  const config = ConfigurationManager.getInstance();
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

  // Create mock message group services with 2+ replicas on same node
  // This triggers MOVE_REPLICA strategy in the assignment logic
  const messageGroupServices = new Map();
  const mockService = {
    groupId: 'mg-1',
    nodeId: 'seed-node-1',
    replicaId: 'mg-1-r1',
  };
  messageGroupServices.set('mg-1-r1', mockService);
  messageGroupServices.set('mg-1-r2', {...mockService, replicaId: 'mg-1-r2'});
  messageGroupServices.set('mg-1-r3', {...mockService, replicaId: 'mg-1-r3'});

  // Start a seed node API
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices,
  });

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19091 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0);
    const port = seedApi.getFastify().server.address().port;

    // Create joining service with wsPort for WebSocket server
    // Use short leadership timeout since mock peers can't respond
    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440011',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: `http://localhost:${port}`,
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 500, // Short timeout - mock peers can't respond
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 50,
      },
    });

    const result = await service.join();

    // With mock peers that can't respond, leadership won't establish
    // But we can verify the assignment strategy was correct
    if (result.success) {
      t.equal(result.success, true, 'join should succeed');
      t.equal(service.getPhase(), JoiningPhase.COMPLETE, 'phase should be complete');
    } else {
      // Expected: leadership fails with mock peers, but verify strategy was correct
      t.equal(result.success, false, 'join fails with mock peers');
      t.ok(result.error.includes('leadership'), 'error should mention leadership');
    }

    // Verify the bootstrap response had correct MOVE_REPLICA strategy
    // This is available even if join failed
    t.ok(service.bootstrapResponse, 'should have bootstrap response');
    t.ok(
      service.bootstrapResponse.messageGroupAssignment.strategy ===
        AssignmentStrategy.MOVE_REPLICA,
      'should use MOVE_REPLICA strategy',
    );
    t.equal(
      service.bootstrapResponse.messageGroupAssignment.groupId,
      'mg-1',
      'should target existing group',
    );
  } finally {
    // Cleanup
    if (service) {
      await service.cleanup();
    }
    await seedApi.shutdown();
  }
});

test('NodeJoiningService - hasOperationalMessageGroup', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  // Initially no operational message group
  t.equal(service.hasOperationalMessageGroup(), false);
});

test('NodeJoiningService - cleanup on failure', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:99999', // Invalid port
    config: {
      httpTimeoutMs: 1000,
    },
  });

  const result = await service.join();

  t.equal(result.success, false);
  t.equal(service.getPhase(), JoiningPhase.FAILED);
  t.equal(service.messageGroupServices.size, 0, 'should have cleaned up services');
  t.equal(service.transport, null, 'should have cleaned up transport');
});

test('NodeJoiningService - emits events', async (t) => {
  initializeTestEnvironment();

  // Configure faster Raft elections for testing
  const config = ConfigurationManager.getInstance();
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

  // Start a seed node API
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
  });

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19092 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0);
    const port = seedApi.getFastify().server.address().port;

    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440012',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: `http://localhost:${port}`,
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
      },
    });

    const events = [];
    service.on('phaseStart', (data) => events.push({type: 'start', phase: data.phase}));
    service.on('phaseComplete', (data) => events.push({type: 'complete', phase: data.phase}));
    service.on('complete', () => events.push({type: 'joinComplete'}));

    await service.join();

    t.ok(events.length > 0, 'should emit events');
    t.ok(events.some((e) => e.type === 'start'), 'should emit phaseStart');
    t.ok(events.some((e) => e.type === 'complete'), 'should emit phaseComplete');
    t.ok(events.some((e) => e.type === 'joinComplete'), 'should emit complete');
  } finally {
    if (service) {
      await service.cleanup();
    }
    await seedApi.shutdown();
  }
});
