/**
 * W-D4b (CDC decision D4, owner 2026-10-26): the hydration -> live CDC
 * hand-off at the GROUP boundary, in a 3-node in-process formation (the seed,
 * one joiner, and a second joiner whose self-hosted message group is held
 * non-active). Every joiner hosts its own message group (CREATE_SELF_HOSTED),
 * so a joiner is not a member of the seed's mg-1, and a propagation wave
 * targets only the message groups whose services rows are active in the
 * propagating node's cache. While the second joiner's group rows are held
 * non-active (its own activation step is gated - nothing in src is changed),
 * more than 256 node_endpoints writes and one DELETE of a row that was in its
 * bootstrap snapshot commit on the seed's leader and are acknowledged. After
 * the release the joiner's cache must equal the authoritative node_endpoints
 * rows of this witness, the deleted row absent, within the CDC readiness
 * budget.
 *
 * Design: solve/epics/raft-rs-full-cutover/evidence/cdc-lifecycle-2026-10-26/
 * (section 2.3, the constructed group-level race; section 5, W-D4b). The
 * outcome decides whether the owner's option (a) or (b) is needed.
 */
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeService} from '../../src/node/node-service.js';
import {COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES} from
  '../../src/constants/index.js';
import {CDC_PIPELINE_READINESS_TIMEOUT_MS} from
  '../../src/constants/cdc-lifecycle-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  cleanupTestEnvironment,
  createInProcHttpPost,
  createJoiningNodeFixtureOwner,
  createVirginSeedBootstrapService,
  getUniquePort,
  gracefulShutdown,
  initializeTestEnvironment,
  quiescePostJoinRebalancing,
  TEST_CONFIG,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 480000;
const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440d40';
const FIRST_JOINER_ID = '550e8400-e29b-41d4-a716-446655440d41';
const HELD_JOINER_ID = '550e8400-e29b-41d4-a716-446655440d42';
const JOIN_ATTEMPTS = 3;
const JOINING_CONFIG = Object.freeze({
  httpTimeoutMs: NUM.FIVE_THOUSAND,
  leadershipWaitTimeoutMs: 12000,
  leadershipWaitInitialDelayMs: NUM.TEN,
  leadershipWaitMaxDelayMs: NUM.HUNDRED,
  replicaStaggerDelayMs: 20,
});
const ACKNOWLEDGED_TIMEOUT_MS = 180000;
const POLL_INTERVAL_MS = 100;
const HELD_WRITES = 260;
const WITNESS_PREFIX = 'd4b-endpoint-';
const DELETED_ENDPOINT_ID = `${WITNESS_PREFIX}snapshot-row`;
const ENDPOINTS_PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.NODE_ENDPOINTS];

function witnessEndpoint(endpointId, now) {
  // An inactive endpoint of a node that does not exist, at the pre-incarnation
  // boot incarnation: never current for routing.
  return {endpoint_id: endpointId, node_id: `${WITNESS_PREFIX}node`,
    transport_type: 'ws', address: `ws://127.0.0.1:1/${endpointId}`, priority: 0,
    metadata: null, status: 'inactive', boot_incarnation: 0,
    created_at: now, updated_at: now};
}

function endpointsLeader(bootstrapResult) {
  return [...bootstrapResult.partitionServices.values()].find((partition) =>
    partition.partitionId === ENDPOINTS_PARTITION_ID && partition.isLeader === true) || null;
}

function witnessIds(rows) {
  return new Set(rows.map((row) => row.endpoint_id)
    .filter((id) => typeof id === 'string' && id.startsWith(WITNESS_PREFIX)));
}

function joinerCacheOf(joiningService) {
  return joiningService?.cdcIntegrationService?.systemTableCache ||
    joiningService?.systemTableCache || null;
}

function compareJoinerToAuthority(leader, joinerCache) {
  const authoritative = witnessIds(leader.db.prepare(
    `SELECT endpoint_id FROM ${TABLES.NODE_ENDPOINTS}`).all());
  const cached = witnessIds(joinerCache?.getAll(TABLES.NODE_ENDPOINTS) || []);
  return {
    authoritativeRows: authoritative.size,
    missingInJoiner: [...authoritative].filter((id) => !cached.has(id)).length,
    staleInJoiner: [...cached].filter((id) => !authoritative.has(id)).length,
    deletedRowInJoiner: cached.has(DELETED_ENDPOINT_ID),
  };
}

function heldGroupRowsNonActive(systemTableCache, nodeId) {
  const rows = systemTableCache.filter(TABLES.SERVICES, (row) =>
    row[COLUMN.NODE_ID] === nodeId &&
    row[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP) || [];
  return rows.every((row) => row[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE);
}

// The joiner's own activation step, gated: the services rows of its
// self-hosted group stay non-active until the witness releases it.
function holdActivation(joiningService) {
  const activate = joiningService.activateMessageGroupServiceRows.bind(joiningService);
  let reach;
  let release;
  const reached = new Promise((resolve) => {
    reach = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });
  joiningService.activateMessageGroupServiceRows = async (...args) => {
    reach();
    await released;
    return activate(...args);
  };
  return {reached, release};
}

async function joinWithRetry(t, fixtures, nodeId, seedWsPort, httpPost, prepare = null) {
  let lastError = null;
  for (let attempt = 1; attempt <= JOIN_ATTEMPTS; attempt += 1) {
    const wsPort = getUniquePort();
    const joiningService = fixtures.create({
      nodeId,
      nodeAddress: `ws://localhost:${wsPort}`,
      seedNodeAddress: 'http://localhost:0',
      seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
      wsPort,
      config: {...TEST_CONFIG.bootstrap, ...JOINING_CONFIG},
      httpPost,
    });
    const prepared = prepare ? prepare(joiningService) : null;
    const join = joiningService.join();
    const joinResult = prepared ? await prepared(join) : await join;
    if (joinResult.success) return {joiningService, joinResult};
    lastError = joinResult.error || 'unknown error';
    t.comment(`join attempt ${attempt} failed for ${nodeId}: ${lastError}`);
    await fixtures.shutdownAttempt(joiningService);
  }
  throw new Error(`${nodeId} did not join: ${lastError}`);
}

test('W-D4b: a joiner whose self-hosted group was non-active while >256 node_endpoints ' +
  'writes and a DELETE committed and were acknowledged converges to the authoritative ' +
  'rows, the deleted row absent', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  initializeTestEnvironment({
    rebalancer: {
      periodicCheckIntervalMs: 600000,
      periodicCheckJitterMs: NUM.HUNDRED,
      stabilizationPeriodMs: 10000,
    },
  });
  const seedWsPort = getUniquePort();
  // The seed's data directory custody, as the production startup path
  // (lagrange-runtime-startup.js) acquires it before an original seed opens.
  const seedDataDir = mkdtempSync(join(tmpdir(), 'lagrange-d4b-seed-'));
  const seedDirectoryOwner = acquireDataDirectoryProcessOwner(seedDataDir);
  const bootstrapService = await createVirginSeedBootstrapService({
    nodeId: SEED_NODE_ID,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    dataDir: seedDataDir,
    dataDirectoryProcessOwner: seedDirectoryOwner,
    config: {...TEST_CONFIG.bootstrap, ...JOINING_CONFIG},
  });
  let bootstrapResult = null;
  let seedApi = null;
  const fixtures = createJoiningNodeFixtureOwner();
  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'seed bootstrap succeeds');
    await bootstrapService.startWebSocketServer();
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
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
      bootstrapStartupAdapter: bootstrapService.bootstrapApiOwner,
      runtimeOwner: bootstrapService.runtimeDependencyOwner,
      assertOriginalSeedPublicAdmission: () =>
        bootstrapService.assertOriginalSeedPublicAdmission(),
    });
    await seedApi.initialize(0, {listen: false});
    seedApi.setSqlQueryEngine(new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      nodeId: SEED_NODE_ID,
    }));
    const httpPost = createInProcHttpPost(seedApi);

    const {joiningService: firstJoiner} = await joinWithRetry(
      t, fixtures, FIRST_JOINER_ID, seedWsPort, httpPost);

    const leader = endpointsLeader(bootstrapResult);
    t.ok(leader, 'the seed leads the node_endpoints partition');
    const inserted = await leader.insertData(TABLES.NODE_ENDPOINTS,
      witnessEndpoint(DELETED_ENDPOINT_ID, Date.now()));
    t.equal(inserted?.success, true, 'the snapshot row commits on the seed');
    t.equal(await waitFor(() => Boolean(systemTableCache.get(TABLES.NODE_ENDPOINTS,
      DELETED_ENDPOINT_ID)), ACKNOWLEDGED_TIMEOUT_MS, POLL_INTERVAL_MS), true,
    'the snapshot row is in the seed cache the joiner snapshot is built from');

    const facts = {};
    const {joiningService, joinResult} = await joinWithRetry(t, fixtures, HELD_JOINER_ID,
      seedWsPort, httpPost, (service) => {
        const hold = holdActivation(service);
        return async (join) => {
          const reached = await Promise.race([hold.reached.then(() => true),
            join.then(() => false)]);
          facts.holdReached = reached;
          if (reached) {
            quiescePostJoinRebalancing(
              bootstrapResult, bootstrapService, firstJoiner, service);
            facts.groupRowsNonActiveDuringHold =
              heldGroupRowsNonActive(systemTableCache, HELD_JOINER_ID);
            const deleted = await leader.deleteData(TABLES.NODE_ENDPOINTS,
              {endpoint_id: DELETED_ENDPOINT_ID});
            facts.deleteCommitted = deleted?.success === true;
            let committedWrites = 0;
            for (let index = 0; index < HELD_WRITES; index += 1) {
              const answer = await leader.insertData(TABLES.NODE_ENDPOINTS,
                witnessEndpoint(`${WITNESS_PREFIX}held-${index}`, Date.now()));
              if (answer?.success === true) committedWrites += 1;
            }
            facts.committedWrites = committedWrites;
            facts.acknowledgedDuringHold = await waitFor(() =>
              countCdcObligations(leader.db).owed === 0,
            ACKNOWLEDGED_TIMEOUT_MS, POLL_INTERVAL_MS);
            facts.groupRowsStillNonActive =
              heldGroupRowsNonActive(systemTableCache, HELD_JOINER_ID);
          }
          hold.release();
          return join;
        };
      });
    t.equal(joinResult.success, true, 'the held joiner joins after the release');
    t.same(facts, {
      holdReached: true,
      groupRowsNonActiveDuringHold: true,
      deleteCommitted: true,
      committedWrites: HELD_WRITES,
      acknowledgedDuringHold: true,
      groupRowsStillNonActive: true,
    }, 'setup: the writes committed and were acknowledged while the group was non-active');

    const joinerCache = joinerCacheOf(joiningService);
    t.ok(joinerCache, 'the held joiner has a system table cache');
    await waitFor(() => {
      const compared = compareJoinerToAuthority(leader, joinerCache);
      return compared.missingInJoiner === 0 && compared.staleInJoiner === 0;
    }, CDC_PIPELINE_READINESS_TIMEOUT_MS, POLL_INTERVAL_MS);
    const compared = compareJoinerToAuthority(leader, joinerCache);
    t.comment(`W-D4b measured: ${JSON.stringify(compared)}`);
    t.same(compared, {
      authoritativeRows: HELD_WRITES,
      missingInJoiner: 0,
      staleInJoiner: 0,
      deletedRowInJoiner: false,
    }, 'the joiner cache equals the authoritative rows, the deleted row absent');
  } finally {
    await fixtures.shutdownAll();
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    seedDirectoryOwner.release();
    rmSync(seedDataDir, {recursive: true, force: true});
    await cleanupTestEnvironment();
  }
});
