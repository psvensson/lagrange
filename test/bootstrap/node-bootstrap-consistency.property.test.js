/**
 * Property Test: Node Bootstrap Consistency (Property 11)
 *
 * For any new node with a self-generated UUID, when it registers with a seed node,
 * it should successfully receive system partition leader addresses and be able to
 * query the cluster state directly.
 *
 * These tests validate the full node joining flow including WebSocket connections.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {v4 as uuidv4, validate as uuidValidate} from 'uuid';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService, JoiningPhase} from '../../src/bootstrap/node-joining-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {URL} from 'url';

// Port counter for unique ports - use high random base to avoid conflicts
let portCounter = 40000 + Math.floor(Math.random() * 10000);

function getUniquePort() {
  return portCounter++;
}

// Initialize test environment with fast Raft elections
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
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

// Clean up test environment
async function cleanupTestEnvironment() {
  try {
    await NodeService.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore
  }
  try {
    await ServiceThreadManager.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore
  }
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

// Create in-process HTTP POST function
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

// Fast bootstrap config
const FAST_BOOTSTRAP_CONFIG = {
  leadershipWaitTimeoutMs: 2000,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 50,
  replicaStaggerDelayMs: 10,
};

// Fast joining config
const FAST_JOINING_CONFIG = {
  httpTimeoutMs: 2000,
  leadershipWaitTimeoutMs: 2000,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 50,
  replicaStaggerDelayMs: 10,
};

test('Property 11: Node Bootstrap Consistency', {timeout: 30000}, async (t) => {
  await t.test('new node with UUID receives bootstrap response from seed', async (t) => {
    // This test validates that any new node with a valid UUID can successfully
    // contact the seed node and receive a valid bootstrap response.
    // We run this as a single iteration since it involves full infrastructure.

    let bootstrapService = null;
    let seedApi = null;
    let joiningService = null;

    try {
      initializeTestEnvironment();

      // Requirement 7.1: Generate unique node ID using UUID v4
      const joiningNodeId = uuidv4();
      t.ok(uuidValidate(joiningNodeId), 'joining node ID should be valid UUID');

      // Start seed node with WebSocket server
      const seedNodeId = uuidv4();
      const seedWsPort = getUniquePort();

      bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: FAST_BOOTSTRAP_CONFIG,
      });

      const bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Start Bootstrap API
      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      // Requirement 7.2: Contact seed node's REST API with self-generated node ID
      const joiningWsPort = getUniquePort();
      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: FAST_JOINING_CONFIG,
        httpPost,
      });

      const joinResult = await joiningService.join();

      // Requirement 7.3: Seed node validates and registers new node
      t.equal(joinResult.success, true, 'join should succeed');
      t.ok(joinResult.bootstrapResponse, 'should have bootstrap response');

      // Requirement 7.4: Seed node determines message group assignment
      // Requirement 7.5: Seed node assigns to existing or creates new message group
      const assignment = joinResult.bootstrapResponse.messageGroupAssignment;
      t.ok(assignment, 'should have message group assignment');
      t.ok(
        assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED ||
        assignment.strategy === AssignmentStrategy.MOVE_REPLICA,
        'should have valid assignment strategy',
      );
    } finally {
      if (joiningService) {
        await joiningService.cleanup().catch(() => {});
      }
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
      await cleanupTestEnvironment();
    }
  });

  await t.test('bootstrap response contains system table snapshots', async (t) => {
    let bootstrapService = null;
    let seedApi = null;
    let joiningService = null;

    try {
      initializeTestEnvironment();

      const seedNodeId = uuidv4();
      const seedWsPort = getUniquePort();

      bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: FAST_BOOTSTRAP_CONFIG,
      });

      const bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      const joiningNodeId = uuidv4();
      const joiningWsPort = getUniquePort();

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: FAST_JOINING_CONFIG,
        httpPost,
      });

      const joinResult = await joiningService.join();

      t.equal(joinResult.success, true, 'join should succeed');
      t.ok(joinResult.bootstrapResponse, 'should have bootstrap response');
      t.ok(
        joinResult.bootstrapResponse.systemTableSnapshots !== undefined,
        'should have system table snapshots',
      );
    } finally {
      if (joiningService) {
        await joiningService.cleanup().catch(() => {});
      }
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
      await cleanupTestEnvironment();
    }
  });

  await t.test('new node establishes message group leadership', async (t) => {
    let bootstrapService = null;
    let seedApi = null;
    let joiningService = null;

    try {
      initializeTestEnvironment();

      const seedNodeId = uuidv4();
      const seedWsPort = getUniquePort();

      bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: FAST_BOOTSTRAP_CONFIG,
      });

      const bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      const joiningNodeId = uuidv4();
      const joiningWsPort = getUniquePort();

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: FAST_JOINING_CONFIG,
        httpPost,
      });

      const joinResult = await joiningService.join();

      t.equal(joinResult.success, true, 'join should succeed');

      // Requirement 7.10: Wait for leadership establishment
      // Requirement 7.14: Bootstrap completes with operational message group
      t.ok(
        joinResult.messageGroupServices && joinResult.messageGroupServices.size > 0,
        'should have message group services',
      );
      t.ok(joiningService.hasOperationalMessageGroup(), 'should have operational message group');
      t.equal(joiningService.getPhase(), JoiningPhase.COMPLETE, 'phase should be complete');
    } finally {
      if (joiningService) {
        await joiningService.cleanup().catch(() => {});
      }
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
      await cleanupTestEnvironment();
    }
  });

  await t.test('duplicate node ID is rejected', async (t) => {
    let bootstrapService = null;
    let seedApi = null;
    let joiningService1 = null;
    let joiningService2 = null;

    try {
      initializeTestEnvironment();

      const seedNodeId = uuidv4();
      const seedWsPort = getUniquePort();

      bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: FAST_BOOTSTRAP_CONFIG,
      });

      const bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      // First node joins successfully
      const duplicateNodeId = uuidv4();
      const joiningWsPort1 = getUniquePort();

      joiningService1 = new NodeJoiningService({
        nodeId: duplicateNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort1}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort1,
        config: FAST_JOINING_CONFIG,
        httpPost,
      });

      const joinResult1 = await joiningService1.join();
      t.equal(joinResult1.success, true, 'first join should succeed');

      // Second node with same ID should fail
      const joiningWsPort2 = getUniquePort();

      joiningService2 = new NodeJoiningService({
        nodeId: duplicateNodeId, // Same node ID
        nodeAddress: `ws://localhost:${joiningWsPort2}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort2,
        config: FAST_JOINING_CONFIG,
        httpPost,
      });

      const joinResult2 = await joiningService2.join();
      t.equal(joinResult2.success, false, 'second join with same ID should fail');
      t.ok(
        joinResult2.error && joinResult2.error.includes('already registered'),
        'error should mention already registered',
      );
    } finally {
      if (joiningService2) {
        await joiningService2.cleanup().catch(() => {});
      }
      if (joiningService1) {
        await joiningService1.cleanup().catch(() => {});
      }
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService) {
        await bootstrapService.shutdown().catch(() => {});
      }
      await cleanupTestEnvironment();
    }
  });
});
