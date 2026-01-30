/**
 * Property Test: Node Bootstrap Consistency (Property 11)
 *
 * For any new node with a self-generated UUID, when it registers with a seed node,
 * it should successfully receive system partition leader addresses and be able to
 * query the cluster state directly.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {v4 as uuidv4, validate as uuidValidate} from 'uuid';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  NodeJoiningService,
  JoiningPhase,
} from '../../src/bootstrap/node-joining-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {URL} from 'url';

// Fast config for tests - reduces Raft election and leadership wait times
const FAST_TEST_CONFIG = {
  httpTimeoutMs: 2000,
  leadershipWaitTimeoutMs: 5000,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 100,
};

// Get a random port for WebSocket server
function getRandomWsPort() {
  return 20000 + Math.floor(Math.random() * 10000);
}

// Initialize test environment
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  // Override raft config after initialization for faster tests
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

// Custom arbitrary for valid node addresses with random ports
const nodeAddressArb = fc.integer({min: 30000, max: 40000})
  .map((port) => `ws://localhost:${port}`);

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

test('Property 11: Node Bootstrap Consistency', async (t) => {
  await t.test('new node with UUID receives bootstrap response from seed', async (t) => {
    initializeTestEnvironment();

    let seedApi = null;
    let service = null;

    try {
      await fc.assert(
        fc.asyncProperty(
          nodeAddressArb,
          async (nodeAddress) => {
            // Requirement 7.1: Generate unique node ID using UUID v4
            const nodeId = uuidv4();

            // Verify UUID is valid
            if (!uuidValidate(nodeId)) {
              return false;
            }

            // Start seed node API
            seedApi = new BootstrapAPI({
              seedNodeId: 'seed-node-1',
              seedNodeAddress: 'ws://localhost:8080',
              messageGroupServices: new Map(),
              systemTableCache: new SystemTableCache(),
            });

            await seedApi.initialize(0, {listen: false});

            // Get wsPort from nodeAddress
            const wsPort = 0;

            // Requirement 7.2: Contact seed node's REST API with self-generated node ID
            service = new NodeJoiningService({
              nodeId,
              nodeAddress,
              seedNodeAddress: 'http://localhost:0',
              wsPort,
              config: FAST_TEST_CONFIG,
              httpPost: createInProcHttpPost(seedApi),
            });

            const result = await service.join();

            // Requirement 7.3: Seed node validates and registers new node
            // Requirement 7.4: Seed node determines message group assignment
            // Requirement 7.5: Seed node assigns to existing or creates new message group
            const isSuccess = result.success === true;
            const hasBootstrapResponse = result.bootstrapResponse !== undefined;
            const hasAssignment = hasBootstrapResponse &&
              result.bootstrapResponse.messageGroupAssignment !== undefined;
            const hasValidStrategy = hasAssignment && (
              result.bootstrapResponse.messageGroupAssignment.strategy ===
                AssignmentStrategy.CREATE_SELF_HOSTED ||
              result.bootstrapResponse.messageGroupAssignment.strategy ===
                AssignmentStrategy.MOVE_REPLICA
            );

            // Cleanup
            await service.cleanup();
            service = null;
            await seedApi.shutdown();
            seedApi = null;

            return isSuccess && hasBootstrapResponse && hasAssignment && hasValidStrategy;
          },
        ),
        {numRuns: 10},
      );

      t.pass('All nodes with valid UUIDs successfully bootstrap');
    } finally {
      if (service) {
        await service.cleanup();
      }
      if (seedApi) {
        await seedApi.shutdown();
      }
    }
  });

  await t.test('bootstrap response contains partition leaders', async (t) => {
    initializeTestEnvironment();

    let seedApi = null;
    let service = null;

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // No random input needed
          async () => {
            const nodeId = uuidv4();
            const wsPort = getRandomWsPort();
            const nodeAddress = `ws://localhost:${wsPort}`;

            seedApi = new BootstrapAPI({
              seedNodeId: 'seed-node-1',
              seedNodeAddress: 'ws://localhost:8080',
              messageGroupServices: new Map(),
              systemTableCache: new SystemTableCache(),
            });

            await seedApi.initialize(0, {listen: false});

            service = new NodeJoiningService({
              nodeId,
              nodeAddress,
              seedNodeAddress: 'http://localhost:0',
              wsPort: 0,
              config: FAST_TEST_CONFIG,
              httpPost: createInProcHttpPost(seedApi),
            });

            const result = await service.join();

            // Verify bootstrap response contains system table snapshots
            const hasSystemTableSnapshots = result.bootstrapResponse &&
              result.bootstrapResponse.systemTableSnapshots !== undefined;

            // Cleanup
            await service.cleanup();
            service = null;
            await seedApi.shutdown();
            seedApi = null;

            return result.success && hasSystemTableSnapshots;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Bootstrap response contains system table snapshots');
    } finally {
      if (service) {
        await service.cleanup();
      }
      if (seedApi) {
        await seedApi.shutdown();
      }
    }
  });

  await t.test('new node establishes message group leadership', async (t) => {
    initializeTestEnvironment();

    let seedApi = null;
    let service = null;

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const nodeId = uuidv4();
            const wsPort = getRandomWsPort();
            const nodeAddress = `ws://localhost:${wsPort}`;

            seedApi = new BootstrapAPI({
              seedNodeId: 'seed-node-1',
              seedNodeAddress: 'ws://localhost:8080',
              messageGroupServices: new Map(),
              systemTableCache: new SystemTableCache(),
            });

            await seedApi.initialize(0, {listen: false});

            service = new NodeJoiningService({
              nodeId,
              nodeAddress,
              seedNodeAddress: 'http://localhost:0',
              wsPort: 0,
              config: FAST_TEST_CONFIG,
              httpPost: createInProcHttpPost(seedApi),
            });

            const result = await service.join();

            // Requirement 7.10: Wait for leadership establishment
            // Requirement 7.14: Bootstrap completes with operational message group
            const hasMessageGroups = result.messageGroupServices &&
              result.messageGroupServices.size > 0;
            const hasOperationalGroup = service.hasOperationalMessageGroup();
            const phaseComplete = service.getPhase() === JoiningPhase.COMPLETE;

            // Cleanup
            await service.cleanup();
            service = null;
            await seedApi.shutdown();
            seedApi = null;

            return result.success && hasMessageGroups && hasOperationalGroup && phaseComplete;
          },
        ),
        {numRuns: 10},
      );

      t.pass('New node establishes message group leadership');
    } finally {
      if (service) {
        await service.cleanup();
      }
      if (seedApi) {
        await seedApi.shutdown();
      }
    }
  });

  await t.test('duplicate node ID is rejected', async (t) => {
    initializeTestEnvironment();

    let seedApi = null;
    let service1 = null;
    let service2 = null;

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const nodeId = uuidv4();

            // Create a fresh mock system table cache for each iteration
            // In production, nodes are registered via CDC to the nodes system table
            const registeredNodes = new Map();
            const mockSystemTableCache = {
              get(tableName, key) {
                if (tableName === 'nodes') {
                  return registeredNodes.get(key) || null;
                }
                return null;
              },
              getAll(tableName) {
                if (tableName === 'nodes') {
                  return Array.from(registeredNodes.values());
                }
                return [];
              },
            };

            seedApi = new BootstrapAPI({
              seedNodeId: 'seed-node-1',
              seedNodeAddress: 'ws://localhost:8080',
              messageGroupServices: new Map(),
              systemTableCache: new SystemTableCache(),
              systemTableCache: mockSystemTableCache,
            });

            await seedApi.initialize(0, {listen: false});

            // First node joins successfully
            const wsPort1 = getRandomWsPort();
            service1 = new NodeJoiningService({
              nodeId,
              nodeAddress: `ws://localhost:${wsPort1}`,
              seedNodeAddress: 'http://localhost:0',
              wsPort: 0,
              config: FAST_TEST_CONFIG,
              httpPost: createInProcHttpPost(seedApi),
            });

            const result1 = await service1.join();
            const firstJoinSuccess = result1.success;

            // Simulate the node being registered via CDC (in production this happens
            // when the node registers itself in the nodes system table)
            if (firstJoinSuccess) {
              registeredNodes.set(nodeId, {
                node_id: nodeId,
                node_address: `ws://localhost:${wsPort1}`,
              });
            }

            // Second node with same ID should fail
            const wsPort2 = getRandomWsPort();
            service2 = new NodeJoiningService({
              nodeId, // Same node ID
              nodeAddress: `ws://localhost:${wsPort2}`,
              seedNodeAddress: 'http://localhost:0',
              wsPort: 0,
              config: FAST_TEST_CONFIG,
              httpPost: createInProcHttpPost(seedApi),
            });

            const result2 = await service2.join();
            const secondJoinFails = !result2.success;

            // Cleanup
            await service1.cleanup();
            service1 = null;
            await service2.cleanup();
            service2 = null;
            await seedApi.shutdown();
            seedApi = null;

            return firstJoinSuccess && secondJoinFails;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Duplicate node IDs are rejected');
    } finally {
      if (service1) {
        await service1.cleanup();
      }
      if (service2) {
        await service2.cleanup();
      }
      if (seedApi) {
        await seedApi.shutdown();
      }
    }
  });
});
