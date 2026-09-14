/**
 * The in-process three-node path for the storage-load scenario: one seed and
 * two joiners in this process, every replica on disk under the run directory,
 * one SQL engine per node. The wiring is the one the integration tests use
 * (test/integration/user-table-metadata-fanout.integration.test.js); this
 * module only lifts it into a start/stop handle for a long run.
 */
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  gracefulJoiningShutdown,
  gracefulShutdown,
  initializeTestEnvironment,
  stopAllRebalancers,
  TEST_CONFIG,
  waitFor,
} from '../integration/helpers/cluster-test-helpers.js';

const SEED_NODE_ID = '7a1d3d2e-0001-4c4e-9d2f-0000000a0001';
const JOINER_NODE_IDS = Object.freeze([
  '7a1d3d2e-0002-4c4e-9d2f-0000000a0002',
  '7a1d3d2e-0003-4c4e-9d2f-0000000a0003',
]);
const NODE_COUNT = JOINER_NODE_IDS.length + 1;
const LEDGER_PARTITION_ID = 'replica_operations-p1';
const LOCALHOST_WS = 'ws://localhost:';
const SEED_HTTP_ADDRESS = 'http://localhost:0';
const DATA_DIRNAME = 'data';
const SEED_DIRNAME = 'seed';
const JOINER_DIRNAME_PREFIX = 'joiner-';
const REBALANCE_PUMP_INTERVAL_MS = 2000;
const LEDGER_SPREAD_WAIT_TIMEOUT_MS = 150000;
const POLL_INTERVAL_MS = 50;
const CREATE_RETRY_DEADLINE_MS = 120000;
const CREATE_RETRY_MIN_DELAY_MS = 100;
const CONTRACT_STATE_PENDING = 'pending';
const CONTRACT_STATE_READY = 'ready';
// Each pending provisioning attempt stays short so the durable create-retry
// loop cycles instead of parking on one long attempt.
const CREATE_PROVISIONING_TIMEOUT_MS = 10000;
const SEED_LEADERSHIP_WAIT_TIMEOUT_MS = 3000;
const JOINER_CONFIG = Object.freeze({
  httpTimeoutMs: 5000,
  leadershipWaitTimeoutMs: 10000,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 100,
  replicaStaggerDelayMs: 20,
});
// The periodic rebalancer is throttled for join determinism (as in the
// integration tests); the pump below drives the same reconcile checks.
const REBALANCER_CONFIG = Object.freeze({
  periodicCheckIntervalMs: 600000,
  periodicCheckJitterMs: 100,
  stabilizationPeriodMs: 10000,
});
const ERROR = Object.freeze({
  SEED_BOOTSTRAP: 'seed bootstrap failed',
  JOIN_FAILED: 'joiner failed to join: ',
  LEDGER_SPREAD: 'operation-ledger voter quorum stayed concentrated: ',
  CREATE_TABLE: 'create table did not reach ready: ',
});

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function partitionServiceMaps(seed, joiners) {
  const maps = [seed.bootstrapResult.partitionServices];
  for (const joiner of joiners) maps.push(joiner.service.partitionServices);
  return maps.filter((map) => map instanceof Map);
}

function pumpRebalanceChecks(seed, joiners) {
  for (const map of partitionServiceMaps(seed, joiners)) {
    for (const service of map.values()) {
      service?.rebalancer?.enqueueRebalanceCheck?.(
        RECONCILE_REASON.PERIODIC_CHECK,
      );
    }
  }
}

function buildSqlEngine(seed, nodeId, extra = {}) {
  return new SQLQueryEngine({
    systemCache: seed.systemTableCache,
    messageRouter: seed.bootstrapResult.messageRouter,
    cdcIntegrationService: seed.bootstrapService.cdcIntegrationService,
    nodeId,
    rebalanceCoordinator: seed.bootstrapService.rebalanceCoordinator,
    ...extra,
  });
}

async function startSeed(runDir) {
  const seedDataDir = join(runDir, DATA_DIRNAME, SEED_DIRNAME);
  mkdirSync(seedDataDir, {recursive: true});
  initializeTestEnvironment({
    nodeId: SEED_NODE_ID,
    rebalancer: {...REBALANCER_CONFIG},
    storage: {dataDir: seedDataDir},
  });
  DataDirectoryManager.resetInstance();
  const dataDirectoryManager = DataDirectoryManager.getInstance();
  dataDirectoryManager.initialize();
  const wsPort = getUniquePort();
  const bootstrapService = new BootstrapService({
    nodeId: SEED_NODE_ID,
    nodeAddress: LOCALHOST_WS + wsPort,
    wsPort,
    dataDirectoryManager,
    config: {
      ...TEST_CONFIG.bootstrap,
      leadershipWaitTimeoutMs: SEED_LEADERSHIP_WAIT_TIMEOUT_MS,
    },
  });
  const bootstrapResult = await bootstrapService.bootstrap();
  if (bootstrapResult.success !== true) throw new Error(ERROR.SEED_BOOTSTRAP);
  const systemTableCache = NodeService.getInstance().getSystemTableCache();
  const seedApi = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: LOCALHOST_WS + wsPort,
    seedNodeWsAddress: LOCALHOST_WS + wsPort,
    messageGroupServices: bootstrapResult.messageGroupServices,
    partitionServices: bootstrapResult.partitionServices,
    systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    epochManager: bootstrapResult.epochManager,
    bootstrapService,
  });
  await seedApi.initialize(0, {listen: false});
  const seed = {
    nodeId: SEED_NODE_ID,
    wsPort,
    dataDir: seedDataDir,
    bootstrapService,
    bootstrapResult,
    systemTableCache,
    seedApi,
    sqlEngine: null,
  };
  seed.sqlEngine = buildSqlEngine(seed, SEED_NODE_ID);
  seedApi.setSqlQueryEngine(seed.sqlEngine);
  return seed;
}

async function joinNode(seed, runDir, nodeId, index) {
  const dataDir = join(runDir, DATA_DIRNAME, JOINER_DIRNAME_PREFIX + index);
  mkdirSync(dataDir, {recursive: true});
  const wsPort = getUniquePort();
  const service = new NodeJoiningService({
    nodeId,
    nodeAddress: LOCALHOST_WS + wsPort,
    seedNodeAddress: SEED_HTTP_ADDRESS,
    seedNodeWsAddress: LOCALHOST_WS + seed.wsPort,
    wsPort,
    dataDir,
    config: {...JOINER_CONFIG},
    httpPost: createInProcHttpPost(seed.seedApi),
  });
  const joinResult = await service.join();
  if (joinResult.success !== true) {
    throw new Error(ERROR.JOIN_FAILED + nodeId);
  }
  return {
    nodeId,
    wsPort,
    dataDir,
    service,
    joinResult,
    systemTableCache: service.cdcIntegrationService?.systemTableCache || null,
    sqlEngine: service.cdcIntegrationService?.sqlQueryEngine || null,
  };
}

async function waitForLedgerSpread(seed) {
  let lastConcentration = null;
  const spread = await waitFor(() => {
    lastConcentration = seed.bootstrapService.rebalanceCoordinator
      .getOperationLedgerQuorumConcentrationForPartition(LEDGER_PARTITION_ID);
    return !lastConcentration;
  }, LEDGER_SPREAD_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
  if (!spread) {
    throw new Error(ERROR.LEDGER_SPREAD + JSON.stringify(lastConcentration));
  }
}

/**
 * Drive a durable CREATE TABLE job to its terminal outcome.
 * @param {SQLQueryEngine} sqlEngine
 * @param {string} createTableSql
 * @return {Promise<Object>} The terminal create outcome (contractState ready).
 */
async function createTableUntilReady(sqlEngine, createTableSql) {
  const deadline = Date.now() + CREATE_RETRY_DEADLINE_MS;
  let result = null;
  while (Date.now() < deadline) {
    result = await sqlEngine.executeQuery(createTableSql);
    if (result.success !== true ||
        result.contractState !== CONTRACT_STATE_PENDING) {
      break;
    }
    const retryAfterMs = Number.isFinite(result.retryAfterMs) &&
      result.retryAfterMs > 0 ? result.retryAfterMs : CREATE_RETRY_MIN_DELAY_MS;
    await sleep(Math.max(CREATE_RETRY_MIN_DELAY_MS, retryAfterMs));
  }
  if (result?.success !== true || result.contractState !== CONTRACT_STATE_READY) {
    throw new Error(ERROR.CREATE_TABLE + JSON.stringify({
      contractState: result?.contractState,
      nextAction: result?.nextAction,
      reasonCodes: result?.reasonCodes,
      error: result?.error,
    }));
  }
  return result;
}

/**
 * Start the in-process three-node cluster under `runDir`.
 * @param {Object} options
 * @param {string} options.runDir - Absolute run directory; data goes below it.
 * @return {Promise<Object>} Handle with seed, joiners, nodes, stop().
 */
async function startInProcessThreeNodeCluster({runDir}) {
  const seed = await startSeed(runDir);
  const joiners = [];
  let pumpTimer = null;
  const stop = async () => {
    if (pumpTimer) clearInterval(pumpTimer);
    for (const map of partitionServiceMaps(seed, joiners)) {
      stopAllRebalancers(map);
    }
    for (const joiner of [...joiners].reverse()) {
      await gracefulJoiningShutdown(joiner.service);
    }
    await gracefulShutdown(seed.bootstrapService, seed.bootstrapResult,
      seed.seedApi);
    await cleanupTestEnvironment();
  };
  try {
    for (let index = 0; index < JOINER_NODE_IDS.length; index += 1) {
      joiners.push(await joinNode(seed, runDir, JOINER_NODE_IDS[index], index));
    }
    pumpTimer = setInterval(() => pumpRebalanceChecks(seed, joiners),
      REBALANCE_PUMP_INTERVAL_MS);
    pumpTimer.unref?.();
    await waitForLedgerSpread(seed);
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
  // The schema-provisioning owner fences its engine to the membership it was
  // built under; the engine that issues CREATE TABLE is built after the joins
  // and the ledger spread, as the integration tests do.
  const schemaEngine = buildSqlEngine(seed, SEED_NODE_ID, {
    tablePartitionProvisioningTimeoutMs: CREATE_PROVISIONING_TIMEOUT_MS,
  });
  const nodes = [seed, ...joiners];
  return {seed, joiners, nodes, nodeCount: NODE_COUNT, schemaEngine, stop};
}

export {NODE_COUNT, createTableUntilReady, startInProcessThreeNodeCluster};
