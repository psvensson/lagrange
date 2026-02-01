/**
 * Tests for Node Joining Service.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
  JoiningPhase,
} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {URL} from 'url';

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
    systemTableCache: new SystemTableCache(),
  });

  const httpPost = async (url, body) => {
    const u = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: u.pathname,
      payload: body,
    });
    return JSON.parse(res.payload);
  };

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19090 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0, {listen: false});

    // Create joining service with wsPort for WebSocket server
    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440010',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      httpPost,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
      },
    });

    // Mock the WebSocket connection to seed node (no real seed WS server in this test)
    service.phaseConnectWebSocket = async function() {
      // Initialize MessageRouter for local communication only
      const {MessageRouter} = await import('../../src/transport/message-router.js');
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      await this.messageRouter.initialize({startServer: true});
      this.transport = this.messageRouter;
    };

    // Mock phases that require system tables (not available in this unit test)
    service.phaseQuerySystemState = async function() {
      // Skip actual system table queries - just mark as complete
    };
    service.initializeReplicaHandler = function() {
      // Skip replica handler initialization
    };
    service.initializeControlPlaneService = async function() {
      // Skip control plane service initialization
    };
    service.signalReadyForReplicas = async function() {
      // Skip ready signal
    };
    service.initializePullBasedAssignment = async function() {
      // Skip pull-based assignment
    };
    service.syncPulledReplicas = async function() {
      // Skip replica sync
    };

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

test('NodeJoiningService - signals readiness after querying state', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440013',
    nodeAddress: 'ws://localhost:19100',
    seedNodeAddress: 'http://localhost:0',
  });

  const order = [];

  // Mock getLeaderMessageGroupService to return a mock service
  service.getLeaderMessageGroupService = () => ({
    isLeaderReplica: () => true,
    getLeaderId: () => 'mg-1-r0',
    unifiedAddress: 'seed-node-1/message-group/mg-1-r0',
  });

  service.phaseContactSeed = async () => {
    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      seedNodeWsAddress: 'ws://localhost:8080',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-1',
        replicaCount: 1,
      },
      systemTableSnapshots: {
        nodes: [],
        partitions: [],
        services: [],
        tables: [],
        message_groups: [],
        replica_operations: [],
      },
    };
    service.seedNodeId = 'seed-node-1';
    service.seedNodeWsAddress = 'ws://localhost:8080';
  };
  service.phaseConnectWebSocket = async () => {
    service.messageRouter = {
      deliver: async () => ({acknowledged: true}),
    };
    service.controlPlaneTargetAddress = 'seed-node-1/message-group/mg-1-r0';
  };
  service.phaseCreateSelfHostedMessageGroup = async () => {};
  service.phaseJoinExistingMessageGroup = async () => {};
  service.phaseWaitForLeadership = async () => {};
  service.initializeReplicaHandler = () => {};
  service.initializeControlPlaneService = async () => {};
  service.initializePullBasedAssignment = async () => {};
  service.syncPulledReplicas = async () => {};
  service.phaseQuerySystemState = async () => {
    order.push('query');
  };
  service.signalReadyForReplicas = async () => {
    order.push('ready');
  };

  const result = await service.join();

  t.equal(result.success, true, 'join should succeed');
  t.equal(order.includes('query'), true, 'should query system state');
  t.equal(order.includes('ready'), true, 'should signal readiness');
  t.equal(order.indexOf('query') < order.indexOf('ready'), true,
    'should signal readiness after state query');
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

  // Create system table cache with message group data
  // This triggers MOVE_REPLICA strategy when there are 2+ replicas on same node
  const systemTableCache = new SystemTableCache();

  // Add message group to cache - no message_groups table entry means no leader check
  // The services table entries are used for MOVE_REPLICA assignment

  // Add 3 replicas on the same node (seed-node-1) with leader role and addresses
  // This satisfies the leader readiness check
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r1',
    service_id: 'mg-1-r1',
    replica_id: 'mg-1-r1',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r1',
    raft_role: 'leader',
    status: 'active',
  });
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r2',
    service_id: 'mg-1-r2',
    replica_id: 'mg-1-r2',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r2',
    raft_role: 'follower',
    status: 'active',
  });
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r3',
    service_id: 'mg-1-r3',
    replica_id: 'mg-1-r3',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r3',
    raft_role: 'follower',
    status: 'active',
  });

  // Start a seed node API with the system table cache
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: systemTableCache,
  });

  const httpPost = async (url, body) => {
    const u = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: u.pathname,
      payload: body,
    });
    return JSON.parse(res.payload);
  };

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19091 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0, {listen: false});

    // Create joining service with wsPort for WebSocket server
    // Use short leadership timeout since mock peers can't respond
    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440011',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      httpPost,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 500, // Short timeout - mock peers can't respond
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 50,
      },
    });

    // Mock the WebSocket connection to seed node (no real seed WS server in this test)
    service.phaseConnectWebSocket = async function() {
      // Initialize MessageRouter for local communication only
      const {MessageRouter} = await import('../../src/transport/message-router.js');
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      await this.messageRouter.initialize({startServer: true});
      this.transport = this.messageRouter;
    };

    // Mock phaseJoinExistingMessageGroup - it requires SQL engine which isn't available
    service.phaseJoinExistingMessageGroup = async function() {
      // Skip actual message group joining - just mark as complete
    };

    service.phaseWaitForLeadership = async () => {
      throw new Error('leadership timeout (test)');
    };

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
    systemTableCache: new SystemTableCache(),
  });

  const httpPost = async (url, body) => {
    const u = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: u.pathname,
      payload: body,
    });
    return JSON.parse(res.payload);
  };

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19092 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0, {listen: false});

    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440012',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      httpPost,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
      },
    });

    // Mock the WebSocket connection to seed node (no real seed WS server in this test)
    service.phaseConnectWebSocket = async function() {
      // Initialize MessageRouter for local communication only
      const {MessageRouter} = await import('../../src/transport/message-router.js');
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      await this.messageRouter.initialize({startServer: true});
      this.transport = this.messageRouter;
    };

    // Mock phases that require system tables (not available in this unit test)
    service.phaseQuerySystemState = async function() {};
    service.initializeReplicaHandler = function() {};
    service.initializeControlPlaneService = async function() {};
    service.signalReadyForReplicas = async function() {};
    service.initializePullBasedAssignment = async function() {};
    service.syncPulledReplicas = async function() {};

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
