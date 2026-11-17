/**
 * WP-D witness (owner decision D3, 2026-11-17): the declared host identity is
 * written into NODES.host_id by the real NODES registration of a seed and of
 * a fresh joiner, read back from the nodes partition's own database through
 * the one reader, and kept by the lifecycle publication that takes each node
 * to READY. Production services, in process; seed and joiner declare
 * distinct synthetic hosts so each row's value is attributable.
 */

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeService} from '../../src/node/node-service.js';
import {COLUMN, NODE_STATE, NUM, STATE, TABLES} from '../../src/constants/index.js';
import {
  NODE_HOST_IDENTITY_STATE,
  readNodeHostIdentity,
} from '../../src/topology/node-host-identity.js';
import {
  TEST_CONFIG,
  cleanupTestEnvironment,
  createVirginSeedBootstrapService,
  createInProcHttpPost,
  getPartitionServices,
  getUniquePort,
  gracefulJoiningShutdown,
  gracefulShutdown,
  initializeTestEnvironment,
  waitFor,
} from '../integration/helpers/cluster-test-helpers.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

const TEST_TIMEOUT_MS = 120000;
const READY_WAIT_MS = 30000;
const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440d11';
const JOINER_NODE_ID = '550e8400-e29b-41d4-a716-446655440d12';
const SEED_HOST = 'host-seed-a';
const JOINER_HOST = 'host-joiner-b';
const JOINING_CONFIG = Object.freeze({
  httpTimeoutMs: NUM.FIVE_THOUSAND,
  leadershipWaitTimeoutMs: 12000,
  leadershipWaitInitialDelayMs: NUM.TEN,
  leadershipWaitMaxDelayMs: NUM.HUNDRED,
  replicaStaggerDelayMs: 20,
});

// The node's row as the nodes partition's own database holds it.
function durableNodeRow(partition, nodeId) {
  const independent = new Database(partition.dbPath, {readonly: true});
  try {
    return independent.prepare(
      `SELECT * FROM ${TABLES.NODES} WHERE node_id = ?`).get(nodeId) || null;
  } finally {
    independent.close();
  }
}

test('NODES.host_id: the seed\'s and a joiner\'s registrations write their ' +
  'declared hosts, read back DECLARED, kept through READY',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  initializeTestEnvironment({
    rebalancer: {
      periodicCheckIntervalMs: 600000,
      periodicCheckJitterMs: NUM.HUNDRED,
      stabilizationPeriodMs: 10000,
    },
  });
  const seedWsPort = getUniquePort();
  const seedAddress = `ws://localhost:${seedWsPort}`;
  const bootstrapService = await createVirginSeedBootstrapService({
    nodeId: SEED_NODE_ID,
    nodeAddress: seedAddress,
    wsPort: seedWsPort,
    hostId: SEED_HOST,
    config: TEST_CONFIG.bootstrap,
  });
  let bootstrapResult = null;
  let seedApi = null;
  const joiningServices = [];
  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    seedApi = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: seedAddress,
      seedNodeWsAddress: seedAddress,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      epochManager: bootstrapResult.epochManager,
      bootstrapStartupAdapter: bootstrapService.bootstrapApiOwner,
      runtimeOwner: bootstrapService.runtimeDependencyOwner,
      assertOriginalSeedPublicAdmission: () =>
        bootstrapService.assertOriginalSeedPublicAdmission(),
    });
    await seedApi.initialize(0, {listen: false});
    seedApi.setSqlQueryEngine(new SQLQueryEngine({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      nodeId: SEED_NODE_ID,
    }));
    const nodesPartition = getPartitionServices(bootstrapResult,
      bootstrapService).find((service) => service.tableName === TABLES.NODES);
    t.ok(nodesPartition, 'setup: the seed hosts the nodes partition');

    const seedRow = durableNodeRow(nodesPartition, SEED_NODE_ID);
    t.equal(seedRow?.[COLUMN.HOST_ID], SEED_HOST,
      'the seed registration wrote its declared host');
    t.same(readNodeHostIdentity(seedRow),
      {state: NODE_HOST_IDENTITY_STATE.DECLARED, hostId: SEED_HOST});
    t.equal(seedRow?.[COLUMN.CONNECTION_STATE], STATE.READY,
      'the seed\'s READY publication kept the host it registered');

    const joinerWsPort = getUniquePort();
    const joiner = new NodeJoiningService({
      hostId: JOINER_HOST,
      bootIncarnation: 1,
      nodeId: JOINER_NODE_ID,
      nodeAddress: `ws://localhost:${joinerWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      seedNodeWsAddress: seedAddress,
      wsPort: joinerWsPort,
      config: {...TEST_CONFIG.bootstrap, ...JOINING_CONFIG},
      httpPost: createInProcHttpPost(seedApi),
    });
    joiningServices.push(joiner);
    const joinResult = await joiner.join();
    t.equal(joinResult.success, true, 'the joiner joins', {error: joinResult.error});
    t.equal(joinResult.lifecycleStateMachine?.getState?.(), NODE_STATE.READY,
      'the joiner reaches READY');

    await waitFor(() => durableNodeRow(nodesPartition, JOINER_NODE_ID)?.[
      COLUMN.CONNECTION_STATE] === STATE.READY, READY_WAIT_MS);
    const joinerRow = durableNodeRow(nodesPartition, JOINER_NODE_ID);
    t.equal(joinerRow?.[COLUMN.HOST_ID], JOINER_HOST,
      'the joiner registration wrote its own declared host');
    t.same(readNodeHostIdentity(joinerRow),
      {state: NODE_HOST_IDENTITY_STATE.DECLARED, hostId: JOINER_HOST});
    t.equal(durableNodeRow(nodesPartition, SEED_NODE_ID)?.[COLUMN.HOST_ID],
      SEED_HOST, 'the seed\'s host is untouched by the join');
    const cachedJoiner = systemTableCache.getAll(TABLES.NODES)
      .find((row) => row?.[COLUMN.NODE_ID] === JOINER_NODE_ID);
    t.equal(cachedJoiner?.[COLUMN.HOST_ID], JOINER_HOST,
      'the seed\'s system-table cache carries the joiner\'s host');
  } finally {
    for (let index = joiningServices.length - 1; index >= 0; index -= 1) {
      await gracefulJoiningShutdown(joiningServices[index]);
    }
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    await cleanupTestEnvironment();
  }
});
