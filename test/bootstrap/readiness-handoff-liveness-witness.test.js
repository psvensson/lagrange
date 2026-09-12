// Witness of architecture/contracts/readiness-handoff-liveness.md: one test
// per invariant, each red when the OWNER's predicate is mutated (never the
// test), time expressed under an injected clock, every bound read from the
// owner at run time rather than typed here.
//
// Registered as the contract's single witness by formation-contracts-registration
// only once every invariant the contract claims has its test in this file.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createBootstrapServiceControlPlaneRuntimeMethods,
} from '../../src/bootstrap/bootstrap-service-control-plane-runtime-methods.js';
import {SeedCacheHydrationPhase} from
  '../../src/bootstrap/phases/seed-cache-hydration-phase.js';
import {
  waitForLocalQueryTransportReadiness,
} from '../../src/bootstrap/shared/local-query-transport-readiness.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_OPERATIONS, SystemTableCache} from '../../src/cache/system-table-cache.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  createNodeHosts,
  initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const NODE_ID = 'handoff-witness-node';
const NODE_ADDRESS = 'ws://127.0.0.1:0';
const ROUTER_ADDRESS = '127.0.0.1:0';
const QUIET_LOGGER = Object.freeze({warn() {}, info() {}, debug() {}, error() {}});
const LEADERSHIP_WAIT_TIMEOUT_MS = 500;
// The seed's own required-write tables (SeedCacheHydrationPhase); their
// canonical leaders are real rows written through the real CDC owner.
const SEED_LEADER_TABLES = Object.freeze([
  SYSTEM_TABLE_NAME.NODES, SYSTEM_TABLE_NAME.NODE_ENDPOINTS, SYSTEM_TABLE_NAME.SERVICES,
]);
const TRANSPORT_NOT_READY_CODE = 'ROUTER_QUERY_TRANSPORT_NOT_READY';
// A runaway owner is caught here rather than by a wall-clock timeout: this
// many sleeps beyond the bound the owner itself reports is unbounded.
const RUNAWAY_FACTOR = 4;

/**
 * A real, unstarted MessageRouter has no query message-group service, so
 * its query/data-plane transport readiness is honestly "unavailable": the
 * startup branch a joiner sits in before its transport is serviceable.
 * @return {MessageRouter}
 */
function createUnserviceableTransport() {
  return new MessageRouter({
    nodeId: NODE_ID, nodeAddress: ROUTER_ADDRESS, wsPort: 0,
  });
}

/**
 * The injected clock: every owner sleep is recorded and resolved without
 * waiting, and a sleep past the owner's own reported bound fails the test.
 * @return {{sleep: function(number): Promise<void>, delays: number[],
 *   limit: {value: number|null}}}
 */
function createVirtualSleep() {
  const delays = [];
  const limit = {value: null};
  return {
    delays,
    limit,
    async sleep(delayMs) {
      delays.push(delayMs);
      if (limit.value !== null && delays.length > limit.value) {
        throw new Error(
          `owner slept ${delays.length} times past its own bound of ${limit.value}: ` +
          'the startup handoff is not terminal');
      }
    },
  };
}

test('startup-handoff-eventually-terminal: a handoff whose transport never ' +
  'becomes serviceable terminates, blocked, within the bound the owner reports',
async () => {
  // The owner reports its own bound on every retry (attempt, maxAttempts);
  // the witness reads N from there and never types it.
  const clock = createVirtualSleep();
  const retries = [];
  let terminal = null;
  try {
    await waitForLocalQueryTransportReadiness({
      messageRouter: createUnserviceableTransport(),
      sleep: clock.sleep,
      onRetry(report) {
        retries.push(report);
        clock.limit.value = report.maxAttempts * RUNAWAY_FACTOR;
      },
    });
  } catch (error) {
    terminal = error;
  }

  assert.ok(terminal, 'a handoff that never becomes serviceable must not resolve ready');
  assert.ok(retries.length > 0, 'the owner reports its retry bound while deferring');
  const reportedBound = retries[0].maxAttempts;
  assert.ok(Number.isInteger(reportedBound) && reportedBound > 0,
    `the owner reports a positive integer bound: ${reportedBound}`);
  assert.equal(retries.length, reportedBound - 1,
    'the owner retries exactly up to its reported bound, then stops');
  assert.equal(clock.delays.length, reportedBound - 1,
    'every deferral waited on the injected clock, none on the wall clock');
  assert.deepEqual(arrayMap(retries, (report) => report.attempt),
    arrayMap(retries, (_, index) => index + 1),
    'attempts are counted monotonically by the owner');

  // Terminal means a typed outcome the observers can act on, not a bare
  // throw: the owner's progress contract names the blocked dependency, the
  // wake that can lift it, and the retry hint.
  const contract = terminal.progressContract;
  assert.ok(contract && typeof contract === 'object',
    'the terminal outcome carries the owner progress contract');
  assert.equal(contract.blockingDependency, 'local_query_transport');
  assert.equal(contract.nextAction, 'wait_for_local_query_transport');
  assert.ok(typeof contract.wakeSource === 'string' && contract.wakeSource.length > 0,
    'a blocked handoff names the wake that can resume it');
  assert.ok(Number.isInteger(terminal.retryAfterMs) && terminal.retryAfterMs >= 0,
    'the terminal outcome carries a retry hint for the wake');
});

/**
 * A seed whose system service leaders are canonical in its cache: a
 * partition row with a leader node and an active partition service on that
 * node, for each table the seed must be able to write before it registers.
 * Rows are data, applied through the cache owner's own apply (the leg
 * replication lands them by); nothing here plays an owner.
 * @param {SystemTableCache} cache
 */
function installCanonicalSeedLeaders(cache) {
  for (const tableName of SEED_LEADER_TABLES) {
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, CDC_OPERATIONS.INSERT, {
      [COLUMN.PARTITION_ID]: partitionId,
      table_name: tableName,
      [COLUMN.LEADER_NODE_ID]: NODE_ID,
    });
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, CDC_OPERATIONS.INSERT, {
      [COLUMN.SERVICE_ID]: `${partitionId}-r1`,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: partitionId,
      [COLUMN.NODE_ID]: NODE_ID,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${NODE_ID}/partition/${partitionId}-r1`,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    });
  }
}

/**
 * The seed registration owner, hosted: the REAL runtime methods
 * (production prototype inherited), over real owners - the CDC owner and
 * gateway for the node's cache, the real HeartbeatService, the real
 * SeedCacheHydrationPhase over the seed's delegates - with the one seam
 * every host here declares (the SQL engine) and an unstarted, hence
 * unserviceable, real MessageRouter.
 * @param {object} options
 * @return {{seed: object, cache: SystemTableCache, clock: object}}
 */
function createSeedRegistrationHost(options = {}) {
  const cache = new SystemTableCache();
  const messageRouter = createUnserviceableTransport();
  const hosts = createNodeHosts(cache, {nodeId: NODE_ID, messageRouter});
  const clock = createVirtualSleep();
  const heartbeatService = new HeartbeatService({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    cdcIntegrationService: hosts.cdcIntegrationService,
    systemTableCache: cache,
    controlPlaneSystemTableGateway: hosts.controlPlaneSystemTableGateway,
    isNodeLifecycleReady: () => true,
  });
  const seedCacheHydrationPhase = new SeedCacheHydrationPhase({
    delegates: {
      getConfig: () => ({leadershipWaitTimeoutMs: LEADERSHIP_WAIT_TIMEOUT_MS}),
      getSystemTableCache: () => cache,
      getPartitionServices: () => new Map(),
      getLogger: () => QUIET_LOGGER,
    },
  });
  const seed = Object.assign(
    Object.create(createBootstrapServiceControlPlaneRuntimeMethods()), {
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      messageRouter,
      cdcIntegrationService: hosts.cdcIntegrationService,
      heartbeatService,
      seedCacheHydrationPhase,
      logger: QUIET_LOGGER,
      sleep: clock.sleep,
      ...options,
    });
  return {seed, cache, hosts, clock};
}

test('ready-requires-serviceable-canonical-leader: the seed does not register ' +
  'ready while its query transport is unserviceable, even with canonical leaders',
async () => {
  initializeTestEnvironment();
  const {seed, cache, clock} = createSeedRegistrationHost();
  installCanonicalSeedLeaders(cache);
  clock.limit.value = null;
  let outcome = null;
  try {
    await seed.registerSeedNodeWithControlPlane();
  } catch (error) {
    outcome = error;
  }

  // The canonical leaders were satisfied (the owner got past that wait to
  // the transport gate) and the transport gate refused with its typed code:
  // a mutated owner that skipped the gate would either register the node
  // row below or fail elsewhere with another code.
  assert.ok(outcome, 'registration must not complete over an unserviceable transport');
  assert.equal(outcome.code, TRANSPORT_NOT_READY_CODE,
    `the refusal is the transport gate's own: ${outcome.message}`);
  assert.equal(outcome.progressContract?.blockingDependency, 'local_query_transport');
  assert.deepEqual(cache.getAll(SYSTEM_TABLE_NAME.NODES), [],
    'no node row is registered before the transport is serviceable');
  assert.ok(clock.delays.length > 0,
    'the owner deferred on the injected clock before refusing');
});
