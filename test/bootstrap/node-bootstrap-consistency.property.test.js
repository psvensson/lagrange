/**
 * Property Test: Node Bootstrap Consistency (Property 11)
 *
 * For any new node with a self-generated UUID, when it registers with a seed node,
 * it should successfully receive system partition leader addresses and be able to
 * query the cluster state directly.
 *
 * These tests validate the bootstrap response properties without requiring
 * the full join flow to complete.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {v4 as uuidv4, validate as uuidValidate} from 'uuid';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {BOOTSTRAP_PIPELINE_ERROR_CODE} from '../../src/bootstrap/bootstrap-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {URL} from 'url';
import Database from 'better-sqlite3';
import {existsSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {
  createJoiningNodeFixtureOwner,
  createVirginSeedBootstrapService,
} from
  '../integration/helpers/cluster-test-helpers.js';

const ports = createPortAllocator(import.meta.url);
function getUniquePort() {
  return ports.getPort();
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
      electionTimeoutMinMs: 500,
      electionTimeoutMaxMs: 900,
      heartbeatIntervalMs: 150,
    },
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

// Clean up test environment
async function cleanupTestEnvironment() {
  await NodeService.getInstance().shutdown().catch(() => {});
  await ServiceThreadManager.getInstance().shutdown().catch(() => {});
  await LoggingService.getInstance().shutdown().catch(() => {});
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

const BOOTSTRAP_RETRY_CONFIG = Object.freeze({
  maxAttempts: 2,
  initialDelayMs: 25,
  maxDelayMs: 100,
  backoffMultiplier: 2,
});

// Create in-process HTTP POST function
function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    let delayMs = BOOTSTRAP_RETRY_CONFIG.initialDelayMs;

    for (let attempt = 1; attempt <= BOOTSTRAP_RETRY_CONFIG.maxAttempts; attempt++) {
      const res = await seedApi.getFastify().inject({
        method: 'POST',
        url: pathname,
        payload: body,
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return res.json();
      }

      let parsedPayload = null;
      try {
        parsedPayload = res.json();
      } catch (_error) {
        void _error;
      }

      const isLeaderMetadataRetry =
        res.statusCode === 503 &&
        parsedPayload &&
        parsedPayload.code === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE &&
        attempt < BOOTSTRAP_RETRY_CONFIG.maxAttempts;
      if (!isLeaderMetadataRetry) {
        throw new Error(`HTTP ${res.statusCode}: ${res.payload}`);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * BOOTSTRAP_RETRY_CONFIG.backoffMultiplier,
        BOOTSTRAP_RETRY_CONFIG.maxDelayMs);
    }

    throw new Error('Bootstrap retries exhausted before leaders became available');
  };
}

// Fast bootstrap config
const FAST_BOOTSTRAP_CONFIG = {
  leadershipWaitTimeoutMs: 5000,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 50,
  replicaStaggerDelayMs: 10,
};

test('Property 11: Node Bootstrap Consistency', {timeout: 90000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('new node with UUID receives valid bootstrap response', async (t) => {
    // This test validates that any new node with a valid UUID can successfully
    // contact the seed node and receive a valid bootstrap response.

    let bootstrapService = null;
    let seedApi = null;

    try {
      // Requirement 7.1: Generate unique node ID using UUID v4
      const joiningNodeId = uuidv4();
      t.ok(uuidValidate(joiningNodeId), 'joining node ID should be valid UUID');

      // Start seed node with WebSocket server
      const seedNodeId = uuidv4();
      const seedWsPort = getUniquePort();

      bootstrapService = await createVirginSeedBootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: FAST_BOOTSTRAP_CONFIG,
      });

      const bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

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
      const joiningNodeAddress = `ws://localhost:${joiningWsPort}`;

      // Make bootstrap request directly via HTTP POST
      const bootstrapResponse = await httpPost('http://localhost:0/bootstrap', {
        nodeId: joiningNodeId,
        nodeAddress: joiningNodeAddress,
      });

      // Requirement 7.3: Seed node validates and registers new node
      t.ok(bootstrapResponse, 'should have bootstrap response');
      t.equal(bootstrapResponse.seedNodeId, seedNodeId, 'should have seed node ID');

      // Requirement 7.4: Seed node determines message group assignment
      // Requirement 7.5: the joiner hosts its own message group (a
      // message-group identity is never moved to it).
      const assignment = bootstrapResponse.messageGroupAssignment;
      t.ok(assignment, 'should have message group assignment');
      t.equal(assignment.strategy, AssignmentStrategy.CREATE_SELF_HOSTED,
        'should have valid assignment strategy');

      // Verify system table snapshots are included
      t.ok(
        bootstrapResponse.systemTableSnapshots !== undefined,
        'should have system table snapshots',
      );
    } finally {
      if (seedApi) await seedApi.shutdown().catch(() => {});
      if (bootstrapService) await bootstrapService.shutdown().catch(() => {});
    }
  });

  await t.test('repeated bootstrap attempt for the same node is deferred, rejected, or idempotent', async (t) => {
    let bootstrapService = null;
    let seedApi = null;

    try {
      const seedNodeId = uuidv4();
      const seedWsPort = getUniquePort();

      bootstrapService = await createVirginSeedBootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: FAST_BOOTSTRAP_CONFIG,
      });

      const bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

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

      // First registration should succeed
      const duplicateNodeId = uuidv4();
      const joiningWsPort1 = getUniquePort();

      const response1 = await httpPost('http://localhost:0/bootstrap', {
        nodeId: duplicateNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort1}`,
      });
      t.ok(response1, 'first registration should succeed');

      // A second bootstrap for the same node may now hit the stricter
      // MOVE_REPLICA admission guard before the duplicate/conflict surface.
      // All of these outcomes are valid:
      // - rejected as a duplicate/conflict
      // - deferred while the earlier MOVE_REPLICA handoff stabilizes
      // - accepted idempotently with a valid bootstrap response
      const joiningWsPort2 = getUniquePort();
      let secondResponse = null;
      let error = null;
      try {
        secondResponse = await httpPost('http://localhost:0/bootstrap', {
          nodeId: duplicateNodeId,
          nodeAddress: `ws://localhost:${joiningWsPort2}`,
        });
      } catch (e) {
        error = e;
      }

      if (error) {
        t.ok(
          error.message.includes('409') ||
            error.message.includes('already registered') ||
            error.message.includes('HTTP 503') ||
            error.message.includes('BOOTSTRAP_NOT_READY') ||
            error.message.includes('MOVE_REPLICA_HANDOFF_STABILIZING'),
          'error should indicate duplicate rejection or in-progress bootstrap deferral',
        );
      } else {
        t.ok(secondResponse, 'idempotent second registration should return a response');
        t.equal(secondResponse.seedNodeId, seedNodeId, 'response should target same seed');
      }
    } finally {
      if (seedApi) await seedApi.shutdown().catch(() => {});
      if (bootstrapService) await bootstrapService.shutdown().catch(() => {});
    }
  });

  await t.test('bootstrap response contains required fields', async (t) => {
    let bootstrapService = null;
    let seedApi = null;

    try {
      const seedNodeId = uuidv4();
      const seedWsPort = getUniquePort();

      bootstrapService = await createVirginSeedBootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: FAST_BOOTSTRAP_CONFIG,
      });

      const bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

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

      const response = await httpPost('http://localhost:0/bootstrap', {
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
      });

      // Verify all required fields are present
      t.ok(response.seedNodeId, 'should have seedNodeId');
      t.ok(response.seedNodeWsAddress, 'should have seedNodeWsAddress');
      t.ok(response.messageGroupAssignment, 'should have messageGroupAssignment');
      t.ok(response.systemTableSnapshots !== undefined, 'should have systemTableSnapshots');
      t.ok(response.currentEpoch !== undefined, 'should have currentEpoch');
    } finally {
      if (seedApi) await seedApi.shutdown().catch(() => {});
      if (bootstrapService) await bootstrapService.shutdown().catch(() => {});
    }
  });
});

test('virgin seed fixture binds startup admission and storage to one unique ' +
  'owned directory', async (t) => {
  initializeTestEnvironment();
  const [first, second] = await Promise.all([
    createVirginSeedBootstrapService({nodeId: 'virgin-seed-a'}),
    createVirginSeedBootstrapService({nodeId: 'virgin-seed-b'}),
  ]);
  const firstDir = first.dataDirectoryManager.getDataDir();
  const secondDir = second.dataDirectoryManager.getDataDir();
  t.not(firstDir, secondDir,
    'concurrent virgin seeds never share implicit physical storage');
  t.equal(resolve(firstDir), resolve(first.dataDirectoryManager.getDataDir()),
    'startup admission and storage manager use the same canonical path');
  t.equal(resolve(secondDir), resolve(second.dataDirectoryManager.getDataDir()),
    'each concurrent fixture retains its own canonical path');
  t.ok(existsSync(firstDir) && existsSync(secondDir),
    'both owned directories exist before shutdown');
  await Promise.all([first.shutdown(), second.shutdown()]);
  t.notOk(existsSync(firstDir), 'first owned directory is removed on shutdown');
  t.notOk(existsSync(secondDir), 'second owned directory is removed on shutdown');
  await cleanupTestEnvironment();
});

test('joining-node fixture owns unique stable paths across retries',
  async (t) => {
    initializeTestEnvironment();
    const owner = createJoiningNodeFixtureOwner();
    const explicitDir = mkdtempSync(join(tmpdir(), 'lagrange-join-explicit-'));
    const common = {
      nodeAddress: 'ws://localhost:9191',
      seedNodeAddress: 'ws://seed:8000',
    };
    const firstAttempt = owner.create({...common, nodeId: 'join-a'});
    const retryAttempt = owner.create({...common, nodeId: 'join-a'});
    const secondNode = owner.create({...common, nodeId: 'join-b'});
    const explicitNode = owner.create({
      ...common,
      nodeId: 'join-explicit',
      bootIncarnation: 7,
      dataDir: explicitDir,
    });
    const firstDir = resolve(firstAttempt.dataDir);

    t.equal(resolve(retryAttempt.dataDir), firstDir,
      'a retry for one logical node reuses its exact storage identity');
    t.not(resolve(secondNode.dataDir), firstDir,
      'different logical nodes receive distinct canonical paths');
    t.equal(resolve(explicitNode.dataDir), resolve(explicitDir),
      'an explicit dataDir remains authoritative');
    t.equal(firstAttempt.bootIncarnation, 1,
      'a virgin logical node receives canonical initial boot identity');
    // Owner decision 2026-09-29e §2: a retry that constructs a new join
    // service is a new boot lifecycle and never reuses an issued
    // incarnation (only retries inside one live attempt keep it).
    t.equal(retryAttempt.bootIncarnation, firstAttempt.bootIncarnation + 1,
      'a new boot lifecycle for the same node reserves a strictly larger ' +
        'incarnation');
    t.equal(explicitNode.bootIncarnation, 7,
      'an explicit boot identity remains authoritative');
    t.equal(owner.assertDistinctNodePaths(), true,
      'the fixture proves path uniqueness before join begins');
    t.ok(existsSync(firstDir), 'the owned retry directory exists before shutdown');

    await owner.shutdownAttempt(firstAttempt);
    t.ok(existsSync(firstDir),
      'ending one attempt does not destroy storage needed by its retry');
    await owner.shutdownAll();
    t.notOk(existsSync(firstDir),
      'final owner shutdown removes implicitly owned storage');
    t.ok(existsSync(explicitDir),
      'final owner shutdown does not remove caller-owned explicit storage');
    rmSync(explicitDir, {recursive: true, force: true});
    await cleanupTestEnvironment();
  });

test('virgin seed fixture refuses mismatched and non-virgin physical storage',
  async (t) => {
    initializeTestEnvironment();
    const explicitDir = mkdtempSync(join(tmpdir(), 'lagrange-seed-explicit-'));
    const differentDir = mkdtempSync(join(tmpdir(), 'lagrange-seed-other-'));
    const manager = {
      isInitialized: () => true,
      getDataDir: () => explicitDir,
    };
    await t.rejects(
      createVirginSeedBootstrapService({
        nodeId: 'mismatched-seed',
        dataDir: differentDir,
        dataDirectoryManager: manager,
      }),
      /dataDir must match/u,
      'one bootstrap cannot admit one path and open storage on another',
    );

    const servicesDir = join(explicitDir, 'partitions', 'services-p1');
    mkdirSync(servicesDir, {recursive: true});
    const database = new Database(join(servicesDir, 'services-p1-r1.db'));
    database.exec(
      'CREATE TABLE services (service_id TEXT PRIMARY KEY, status TEXT); ' +
      'INSERT INTO services VALUES (\'existing-service\', \'active\')',
    );
    database.close();
    await t.rejects(
      createVirginSeedBootstrapService({
        nodeId: 'non-virgin-seed',
        dataDir: explicitDir,
        dataDirectoryManager: manager,
      }),
      /durable SERVICES identity/u,
      'durable identity prevents a non-virgin directory from seed admission',
    );
    rmSync(explicitDir, {recursive: true, force: true});
    rmSync(differentDir, {recursive: true, force: true});
    await cleanupTestEnvironment();
  });
