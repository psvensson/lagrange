/**
 * Message Group Multi-Join Formation Integration Test.
 *
 * Verifies message-group creation and availability for each joining node
 * across a larger topology than seed + 2 nodes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {isNodeRecordReady} from '../../src/node/node-readiness-policy.js';
import {NodeService} from '../../src/node/node-service.js';
import {COLUMN, NODE_STATE, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF}
  from '../../src/constants/index.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  TEST_CONFIG,
  waitFor,
  gracefulJoiningShutdown,
  gracefulShutdown,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 180000;
const READY_WAIT_TIMEOUT_MS = 15000;
const MESSAGE_GROUP_WAIT_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 100;
const MIN_LOCAL_MESSAGE_GROUPS = NUM.ONE;

const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440600';
const JOINING_NODE_IDS = Object.freeze([
  '550e8400-e29b-41d4-a716-446655440601',
  '550e8400-e29b-41d4-a716-446655440602',
  '550e8400-e29b-41d4-a716-446655440603',
  '550e8400-e29b-41d4-a716-446655440604',
]);

const JOINING_CONFIG = Object.freeze({
  httpTimeoutMs: NUM.FIVE_THOUSAND,
  leadershipWaitTimeoutMs: 12000,
  leadershipWaitInitialDelayMs: NUM.TEN,
  leadershipWaitMaxDelayMs: NUM.HUNDRED,
  replicaStaggerDelayMs: 20,
});

function getNodeMessageGroupRows(systemTableCache, nodeId) {
  return systemTableCache.filter(TABLES.SERVICES, (row) => {
    return row[COLUMN.NODE_ID] === nodeId &&
      row[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
  }) || [];
}

function hasHealthyLocalMessageGroup(service) {
  if (!service || typeof service.getStatus !== TYPEOF.FUNCTION) {
    return false;
  }
  const status = service.getStatus();
  const hasAddress = typeof service.unifiedAddress === TYPEOF.STRING &&
    service.unifiedAddress.length > NUM.ZERO;
  return Boolean(status?.initialized) && hasAddress;
}

test('message group formation across multi-node joins', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  initializeTestEnvironment({
    rebalancer: {
      periodicCheckIntervalMs: 600000,
      periodicCheckJitterMs: NUM.HUNDRED,
      stabilizationPeriodMs: 10000,
    },
  });

  const seedWsPort = getUniquePort();
  const bootstrapService = new BootstrapService({
    nodeId: SEED_NODE_ID,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    config: TEST_CONFIG.bootstrap,
  });

  let bootstrapResult = null;
  let seedApi = null;
  const joiningServices = [];
  const joinResultsByNode = new Map();

  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    t.ok(systemTableCache, 'system table cache should be available');

    seedApi = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
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
    seedApi.setSqlQueryEngine(new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      nodeId: SEED_NODE_ID,
    }));

    const httpPost = createInProcHttpPost(seedApi);
    const expectedReadyNodeCount = JOINING_NODE_IDS.length + NUM.ONE;

    for (const joiningNodeId of JOINING_NODE_IDS) {
      const joiningWsPort = getUniquePort();
      const joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          ...JOINING_CONFIG,
        },
        httpPost,
      });
      joiningServices.push(joiningService);

      const joinResult = await joiningService.join();
      joinResultsByNode.set(joiningNodeId, joinResult);
      t.equal(joinResult.success, true, `${joiningNodeId} should join successfully`);
      if (!joinResult.success) {
        t.comment(`join failed for ${joiningNodeId}: ${joinResult.error || 'unknown error'}`);
        break;
      }
      t.ok(
        joinResult.messageGroupServices.size >= MIN_LOCAL_MESSAGE_GROUPS,
        `${joiningNodeId} should have at least one local message group service`,
      );

      const assignmentStrategy = joinResult.bootstrapResponse?.
        messageGroupAssignment?.
        strategy;
      const hasAssignmentStrategy = typeof assignmentStrategy === TYPEOF.STRING &&
        assignmentStrategy.length > NUM.ZERO;
      t.equal(
        hasAssignmentStrategy,
        true,
        `${joiningNodeId} should receive a message group assignment strategy`,
      );

      const localServices = [...joinResult.messageGroupServices.values()];
      const healthyLocalServices = localServices.filter((service) =>
        hasHealthyLocalMessageGroup(service),
      );
      t.ok(
        healthyLocalServices.length >= MIN_LOCAL_MESSAGE_GROUPS,
        `${joiningNodeId} should initialize healthy local message group service(s)`,
      );

      const lifecycleState = joinResult.lifecycleStateMachine?.getState?.();
      t.equal(
        lifecycleState,
        NODE_STATE.READY,
        `${joiningNodeId} lifecycle should transition to READY`,
      );
    }

    const allNodesReady = await waitFor(() => {
      const now = Date.now();
      const nodeRows = systemTableCache.getAll(TABLES.NODES) || [];
      const readyNodeIds = new Set(
        nodeRows
          .filter((row) => isNodeRecordReady(row, {now, requireActiveStatus: true}))
          .map((row) => row[COLUMN.NODE_ID]),
      );
      return readyNodeIds.size >= expectedReadyNodeCount &&
        readyNodeIds.has(SEED_NODE_ID) &&
        JOINING_NODE_IDS.every((nodeId) => readyNodeIds.has(nodeId));
    }, READY_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
    t.equal(allNodesReady, true, 'seed and all joining nodes should reach ready state');

    for (const joiningNodeId of JOINING_NODE_IDS) {
      const hasCacheRows = await waitFor(() => {
        const rows = getNodeMessageGroupRows(systemTableCache, joiningNodeId);
        return rows.length >= MIN_LOCAL_MESSAGE_GROUPS;
      }, MESSAGE_GROUP_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS);
      t.equal(
        hasCacheRows,
        true,
        `services cache should include active message group rows for ${joiningNodeId}`,
      );

      const rows = getNodeMessageGroupRows(systemTableCache, joiningNodeId);
      const allRowsAddressable = rows.every((row) =>
        typeof row[COLUMN.ADDRESS] === TYPEOF.STRING &&
        row[COLUMN.ADDRESS].length > NUM.ZERO,
      );
      t.equal(
        allRowsAddressable,
        true,
        `services cache rows for ${joiningNodeId} should include routable addresses`,
      );
    }

    const totalLocalMessageGroups = JOINING_NODE_IDS.reduce((count, nodeId) => {
      const joinResult = joinResultsByNode.get(nodeId);
      const localCount = joinResult?.messageGroupServices?.size || NUM.ZERO;
      return count + localCount;
    }, NUM.ZERO);
    t.ok(
      totalLocalMessageGroups >= JOINING_NODE_IDS.length,
      'multi-join run should create at least one local message-group replica per joiner',
    );
  } finally {
    for (let index = joiningServices.length - NUM.ONE; index >= NUM.ZERO; index -= NUM.ONE) {
      await gracefulJoiningShutdown(joiningServices[index]);
    }
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    await cleanupTestEnvironment();
  }
});
