/**
 * W7 (owner ruling on the raft-rs cutover, R6-B): a fresh join whose NODES
 * registration INSERT is cut by a runtime replacement on the seed's nodes
 * partition still joins. The core traps (the runtime owner's
 * setCoreFaultInjector seam, as a trapped WASM instance throws) after the
 * registration's entry is durable and before it commits, so the write is in
 * flight across the replacement and its first answer is OUTCOME_UNKNOWN.
 * The registration must end ACCEPTED - the unknown outcome re-delivered under
 * the write's own entry and answered from its outcome row - never "Node
 * registration at this boot incarnation was not confirmed", and the node's
 * row is written once.
 *
 * The cluster is the fresh-join harness's (seed + one joiner, in process,
 * production services); only the trap is the test's.
 */

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeService} from '../../src/node/node-service.js';
import {NODE_STATE, NUM, TABLES} from '../../src/constants/index.js';
import {setCoreFaultInjector} from
  '../../src/raft/raft-rs-runtime-owner.js';
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
} from '../integration/helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 120000;
const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440711';
const NODE_B_ID = '550e8400-e29b-41d4-a716-446655440712';
const ADVANCE_APPEND = 'advance_append';
const TRAP_MESSAGE = 'unreachable';
const REGISTRATION_INSERT = /^\s*INSERT\s+INTO\s+nodes\b/iu;
const NOT_CONFIRMED = 'Node registration at this boot incarnation was not ' +
  'confirmed';
const JOINING_CONFIG = Object.freeze({
  httpTimeoutMs: NUM.FIVE_THOUSAND,
  leadershipWaitTimeoutMs: 12000,
  leadershipWaitInitialDelayMs: NUM.TEN,
  leadershipWaitMaxDelayMs: NUM.HUNDRED,
  replicaStaggerDelayMs: 20,
});

// Arm a one-shot core trap on the nodes partition the first time node B's
// registration INSERT reaches it (by any path: routed or local leg).
function trapRegistrationInsert(partition) {
  const trap = {armedFor: null, fired: 0, inserts: 0};
  const executeQuery = partition.executeQuery.bind(partition);
  partition.executeQuery = (sql, params = [], options = {}) => {
    if (REGISTRATION_INSERT.test(String(sql)) &&
        Array.isArray(params) && params.includes(NODE_B_ID)) {
      trap.inserts += 1;
      if (trap.armedFor === null) {
        trap.armedFor = partition.partitionId;
        setCoreFaultInjector((groupId, operation) => {
          if (groupId === partition.partitionId &&
              operation === ADVANCE_APPEND) {
            setCoreFaultInjector(null);
            trap.fired += 1;
            throw new globalThis.WebAssembly.RuntimeError(TRAP_MESSAGE);
          }
        });
      }
    }
    return executeQuery(sql, params, options);
  };
  return trap;
}

function nodeRowsOf(partition, nodeId) {
  const independent = new Database(partition.dbPath, {readonly: true});
  try {
    return independent.prepare(
      `SELECT node_id FROM ${TABLES.NODES} WHERE node_id = ?`).all(nodeId);
  } finally {
    independent.close();
  }
}

test('W7: a fresh join whose registration INSERT is cut by a runtime ' +
  'replacement joins - ACCEPTED, its row written once, never "not ' +
  'confirmed"', {timeout: TEST_TIMEOUT_MS}, async (t) => {
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
    config: TEST_CONFIG.bootstrap,
  });
  let bootstrapResult = null;
  let seedApi = null;
  const joiningServices = [];
  const originalConsoleError = console.error;
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
      bootstrapService,
    });
    await seedApi.initialize(0, {listen: false});
    seedApi.setSqlQueryEngine(new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      nodeId: SEED_NODE_ID,
    }));

    const nodesPartition = getPartitionServices(bootstrapResult,
      bootstrapService).find((service) => service.tableName === TABLES.NODES);
    t.ok(nodesPartition, 'setup: the seed hosts the nodes partition');
    const trap = trapRegistrationInsert(nodesPartition);
    console.error = () => undefined;

    const nodeBWsPort = getUniquePort();
    const nodeBService = new NodeJoiningService({
      bootIncarnation: 1,
      nodeId: NODE_B_ID,
      nodeAddress: `ws://localhost:${nodeBWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      seedNodeWsAddress: seedAddress,
      wsPort: nodeBWsPort,
      config: {...TEST_CONFIG.bootstrap, ...JOINING_CONFIG},
      httpPost: createInProcHttpPost(seedApi),
    });
    joiningServices.push(nodeBService);
    const joinResult = await nodeBService.join();
    console.error = originalConsoleError;

    t.ok(trap.inserts >= 1, 'setup: node B\'s registration INSERT reached ' +
      `the nodes partition (${trap.inserts})`);
    t.equal(trap.fired, 1, 'setup: the core trapped mid-registration');
    t.equal(joinResult.success, true, 'node B joins',
      {error: joinResult.error});
    t.notOk(String(joinResult.error ?? '').includes(NOT_CONFIRMED),
      'never "registration not confirmed"');
    t.equal(joinResult.lifecycleStateMachine?.getState?.(), NODE_STATE.READY,
      'node B reaches READY');
    t.equal(nodeRowsOf(nodesPartition, NODE_B_ID).length, 1,
      'node B\'s row is written once');
  } finally {
    console.error = originalConsoleError;
    setCoreFaultInjector(null);
    for (let index = joiningServices.length - 1; index >= 0; index -= 1) {
      await gracefulJoiningShutdown(joiningServices[index]);
    }
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    await cleanupTestEnvironment();
  }
});
