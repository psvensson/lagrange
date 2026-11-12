import {createMockCoordinator, createMockControlPlaneReadinessService} from './test-helpers.js';
/**
 * Deterministic latency witness for the staggered-joiner dead-scheduling gap.
 *
 * Causal model (traced from a five-node staggered-joiner formation overrun):
 * the topology-settling gate of the NEXT priority partition K+1
 * (`getCriticalSystemTopologySettlingBlocker` ->
 * `buildTransitionalNodeBlocker` / `buildEndpointVisibilityBlocker`) holds
 * K+1's CREATE_REPLICA while a joining node's ready-lease and endpoint
 * visibility are not yet published on the seed AND the ready cohort is still
 * below the quorum the recovery lane requires. When partition K's learner
 * replica on the joiner reaches voter-ready and its operation completes, the
 * joiner's ready-lease (NODES row) and its endpoint rows
 * (node_endpoints / service_endpoints) become true in the shared store, so
 * the gate predicate itself is CLEAR. The priority rebalancer's cache
 * subscription must deliver those publications to its visibility decision
 * so K+1 need not wait for getPriorityRetryDelayMs
 * (= CRITICAL_CHECK_DELAY_MS = 5000).
 *
 * These tests reproduce the CAUSAL SEQUENCE, not 60s of wall-clock:
 *  - the gate predicate is proven to defer (a ~5000ms timer) while the
 *    readiness/endpoint facts are false, and to clear the moment they are
 *    true;
 *  - the defer is proven to be a scheduling delay, not absence of work.
 * A disconnected-subscription control proves that changing the rows alone
 * cannot wake K+1. The connected case uses real cache notifications to prove
 * that each publication wakes K+1 on the next notification turn, while the
 * 5s cadence check remains armed as the wait's bound.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  EntityType,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {FIXTURE_ENDPOINT_INCARNATION} from
  '../test-helpers/endpoint-incarnation-fixture.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {createSystemTableCacheFixture} from './system-table-cache-fixture.js';
import {createNodeEndpoint} from './unified-rebalancer-test-support.js';

const SEED_NODE_ID = 'node-seed';
const JOINER_NODE_ID = 'node-joiner';
const PARTITION_K = 'control_plane_publications-p1';
const PARTITION_K1 = 'replica_operations-p1';
const OBSERVATION_NOW_MS = 1_800_000_000_000;
const LIVE_LEASE_EXPIRES_AT_MS = 1_900_000_000_000;
const NODE_ROW_ACTIVE_NOT_READY = Object.freeze({
  node_id: JOINER_NODE_ID,
  boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
  status: 'active',
  connection_state: 'connected',
  ready_lease_expires_at: 0,
  last_heartbeat: OBSERVATION_NOW_MS - 1,
  updated_at: OBSERVATION_NOW_MS - 1,
});
const NODE_ROW_ACTIVE_READY = Object.freeze({
  node_id: JOINER_NODE_ID,
  boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
  status: 'active',
  connection_state: 'ready',
  ready_lease_expires_at: LIVE_LEASE_EXPIRES_AT_MS,
  last_heartbeat: OBSERVATION_NOW_MS,
  updated_at: OBSERVATION_NOW_MS,
});
const JOINER_NODE_ENDPOINT_ROW = Object.freeze(
  createNodeEndpoint(JOINER_NODE_ID),
);
const REASON_NODE_BECAME_READY = 'node_became_ready';
const READY_LEASE_BLOCKER_REASON = 'node_ready_lease_incomplete';
const ENDPOINT_BLOCKER_REASON = 'endpoint_visibility_incomplete';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: SEED_NODE_ID},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createSharedCache() {
  const cache = createSystemTableCacheFixture({
    nodes: [
      {
        node_id: SEED_NODE_ID,
        boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: LIVE_LEASE_EXPIRES_AT_MS,
      },
      {...NODE_ROW_ACTIVE_NOT_READY},
    ],
    partitions: [
      {
        partition_id: PARTITION_K,
        table_id: 'control_plane_publications',
        replica_count: 5,
      },
      {
        partition_id: PARTITION_K1,
        table_id: 'replica_operations',
        replica_count: 5,
      },
    ],
    node_endpoints: [createNodeEndpoint(SEED_NODE_ID)],
    service_endpoints: [],
    replica_operations: [],
    services: [],
    tables: [],
  });
  return cache;
}

function createRebalancer(cache, partitionId) {
  const controlPlaneReadinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache, now: () => OBSERVATION_NOW_MS,
  });
  const rebalancer = new UnifiedRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({minReplicaCount: 3, targetReplicaCount: 5}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => [SEED_NODE_ID],
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: createMockCoordinator({controlPlaneReadinessService}),
    sqlQueryEngine: {executeQuery: async () => ({success: true, rows: []})},
    controlPlaneReadinessService,
    nowFn: () => OBSERVATION_NOW_MS,
    randomSource: {random: () => 0},
  });
  rebalancer.initialize();
  rebalancer.isLeader = true;
  // The seed is the sole READY startup-authority member; the joining node is
  // in the cohort, so while its lease/endpoints are unpublished and the ready
  // cohort (1) is below quorum (3 for a 5-replica target) its NODES row is an
  // honest transitional blocker, not a formation spread-cure target.
  rebalancer.getStartupAuthorityNodeIdSet = () =>
    new Set([SEED_NODE_ID, JOINER_NODE_ID]);
  return rebalancer;
}

function completePartitionKReplicaOnJoiner(rebalancerK) {
  return rebalancerK.handleCoordinatorProgressEvent(
    REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
    {
      operation: {
        operationId: 'op-k-create',
        partitionId: PARTITION_K,
        targetNodeId: JOINER_NODE_ID,
        type: 'ADD',
        status: 'completed',
        workflowStep: 'active',
      },
    },
  );
}

// The joiner's readiness + endpoint facts become true in the shared store:
// the NODES row gains a live ready-lease and the canonical WebSocket
// node_endpoints row appears. This is the same publication the real
// heartbeat / endpoint writers produce once the joiner's first critical
// replica reaches voter-ready and it begins heartbeating. sys-postgres-wire
// is an optional runtime service and publishes nothing at formation time.
function publishJoinerReadinessAndEndpoints(cache) {
  cache.applySystemTableChange(
    'nodes', CDC_OPERATION.UPDATE, {...NODE_ROW_ACTIVE_READY},
  );
  cache.applySystemTableChange(
    'node_endpoints', CDC_OPERATION.INSERT, {...JOINER_NODE_ENDPOINT_ROW},
  );
}

// SystemTableCache defers notifications with setImmediate. Observe the next
// turn after mutations without replacing that delivery or waiting on a poll.
async function awaitCacheNotifications() {
  await new Promise((resolve) => setImmediate(resolve));
}

function createDeferRecorder(rebalancer) {
  const scheduledDelays = [];
  const enqueuedReasons = [];
  rebalancer.scheduleNextCheck = (delayMs) => {
    scheduledDelays.push(delayMs);
  };
  rebalancer.schedulePriorityAwareCheck = () => {
    scheduledDelays.push(rebalancer.getPriorityRetryDelayMs());
  };
  rebalancer.enqueueRebalanceCheck = (reason) => {
    enqueuedReasons.push(reason);
    return true;
  };
  return {scheduledDelays, enqueuedReasons};
}

// Shared causal setup: the joiner's lease is unpublished and the ready cohort
// (seed only) is below the quorum the 5-replica recovery lane requires, so the
// topology-settling gate of partition K+1 holds its CREATE_REPLICA behind an
// honest NODE_READY_LEASE_INCOMPLETE blocker.
function createStaggeredJoinerHarness() {
  initializeTestEnvironment();
  const cache = createSharedCache();
  const rebalancerK = createRebalancer(cache, PARTITION_K);
  const rebalancerK1 = createRebalancer(cache, PARTITION_K1);
  rebalancerK.enqueueRebalanceCheck = () => true;
  rebalancerK.enqueueMembershipPublicationReconcile = () => true;
  const k1 = createDeferRecorder(rebalancerK1);
  return {cache, rebalancerK, rebalancerK1, k1};
}

async function assertJoinerBlocksK1BehindFiveSecondPoll(t, harness) {
  const {rebalancerK1, k1} = harness;
  t.equal(
    rebalancerK1.getCriticalSystemTopologySettlingBlocker()?.reason,
    READY_LEASE_BLOCKER_REASON,
    'below quorum, the unready joiner blocks K+1 on its ready-lease',
  );
  const settleDecision =
    await rebalancerK1.resolveTopologySettlingPlanningGateDecision();
  t.equal(
    settleDecision?.gate,
    'topology_settling',
    'the unready joiner defers K+1 planning on the topology-settling gate',
  );
  rebalancerK1.applyRebalancePlanningGateDecision(settleDecision);
  t.equal(
    k1.scheduledDelays[k1.scheduledDelays.length - 1],
    rebalancerK1.getPriorityRetryDelayMs(),
    'the defer schedules a timer for the full priority retry delay',
  );
  t.equal(
    rebalancerK1.getPriorityRetryDelayMs(),
    5000,
    'the timer is the 5000ms critical-check poll, not a sub-second wake',
  );
}

test(
  'disconnected cache subscription: readiness/endpoint publication produces no level-trigger, so ' +
    'partition K+1 waits out the 5s poll even though its gate is clear',
  async (t) => {
    const harness = createStaggeredJoinerHarness();
    const {cache, rebalancerK, rebalancerK1, k1} = harness;
    t.teardown(() => rebalancerK.shutdown());
    t.teardown(() => rebalancerK1.shutdown());
    await assertJoinerBlocksK1BehindFiveSecondPoll(t, harness);
    rebalancerK1.unbindPriorityRecoveryVisibilityCacheListener();

    // Partition K's learner replica on the joiner reaches voter-ready and its
    // operation completes: the existing executor->coordinator level-trigger
    // fires on the K rebalancer (the rebalancer remains the consumer of
    // operation progress).
    t.equal(
      completePartitionKReplicaOnJoiner(rebalancerK),
      true,
      'partition K operation completion reaches the existing rebalancer lane',
    );

    // The readiness + endpoint facts are now true in the store. The gate
    // predicate is CLEAR and the cohort reaches quorum, but no level-trigger
    // reaches K+1's rebalancer for the NODES/endpoint publication: it still
    // waits out the 5s poll. The defer was a scheduling delay, not absence of
    // work.
    publishJoinerReadinessAndEndpoints(cache);
    t.equal(
      rebalancerK1.getCriticalSystemTopologySettlingBlocker(),
      null,
      'once the readiness/endpoint facts are true, K+1 admits planning',
    );
    t.equal(
      await rebalancerK1.resolveTopologySettlingPlanningGateDecision(),
      null,
      'the clearing predicate is satisfied by the published facts',
    );
    await awaitCacheNotifications();
    t.equal(
      rebalancerK1.priorityRecoveryVisibilityCacheListener,
      null,
      'the negative control has disconnected only the visibility subscription',
    );
    t.equal(
      k1.enqueuedReasons.length,
      0,
      'no level-trigger reaches partition K+1 without the visibility subscription',
    );
  },
);

test(
  'connected cache subscription: readiness/endpoint publication level-triggers partition ' +
    'K+1 on the notification turn, without waiting for the 5s poll',
  async (t) => {
    const harness = createStaggeredJoinerHarness();
    const {cache, rebalancerK, rebalancerK1, k1} = harness;
    t.teardown(() => rebalancerK.shutdown());
    t.teardown(() => rebalancerK1.shutdown());
    await assertJoinerBlocksK1BehindFiveSecondPoll(t, harness);
    t.equal(
      completePartitionKReplicaOnJoiner(rebalancerK),
      true,
      'partition K operation completion reaches the existing rebalancer lane',
    );
    cache.applySystemTableChange(
      'nodes', CDC_OPERATION.UPDATE, {...NODE_ROW_ACTIVE_READY},
    );
    await awaitCacheNotifications();
    t.same(
      k1.enqueuedReasons,
      [REASON_NODE_BECAME_READY],
      'the NODES ready-lease mutation reaches K+1 through its cache subscription',
    );
    cache.applySystemTableChange(
      'node_endpoints', CDC_OPERATION.INSERT, {...JOINER_NODE_ENDPOINT_ROW},
    );
    t.equal(
      await rebalancerK1.resolveTopologySettlingPlanningGateDecision(),
      null,
      'the clearing predicate is satisfied by the published facts',
    );

    await awaitCacheNotifications();
    t.same(
      k1.enqueuedReasons,
      [REASON_NODE_BECAME_READY, REASON_NODE_BECAME_READY],
      'the endpoint mutation independently reaches the same priority consumer',
    );
    t.equal(
      rebalancerK1.getCriticalSystemTopologySettlingBlocker(),
      null,
      'the level-trigger drives the consumer whose gate predicate is now clear',
    );
    rebalancerK1.shutdown();
    cache.applySystemTableChange('nodes', CDC_OPERATION.UPDATE, {
      ...NODE_ROW_ACTIVE_READY,
      ready_lease_expires_at: LIVE_LEASE_EXPIRES_AT_MS + 1,
    });
    await awaitCacheNotifications();
    t.same(k1.enqueuedReasons,
      [REASON_NODE_BECAME_READY, REASON_NODE_BECAME_READY],
      'shutdown detaches the consumer before a later cache mutation');
    t.equal(cache.get('nodes', JOINER_NODE_ID).ready_lease_expires_at,
      LIVE_LEASE_EXPIRES_AT_MS + 1,
      'the later mutation still reaches the cache');
  },
);

test(
  'the endpoint publication also clears the gate, and the 5s poll remains ' +
    'its bound with the predicate unchanged',
  async (t) => {
    initializeTestEnvironment();
    const cache = createSharedCache();
    const rebalancerK1 = createRebalancer(cache, PARTITION_K1);
    t.teardown(() => rebalancerK1.shutdown());
    const k1 = createDeferRecorder(rebalancerK1);

    // Lease published but endpoints not yet: the gate blocks on
    // ENDPOINT_VISIBILITY_INCOMPLETE, still deferring to the 5s poll.
    cache.applySystemTableChange(
      'nodes', CDC_OPERATION.UPDATE, {...NODE_ROW_ACTIVE_READY},
    );
    t.equal(
      rebalancerK1.getCriticalSystemTopologySettlingBlocker()?.reason,
      ENDPOINT_BLOCKER_REASON,
      'with endpoints unpublished, the gate blocks on endpoint visibility',
    );
    const endpointDecision =
      await rebalancerK1.resolveTopologySettlingPlanningGateDecision();
    rebalancerK1.applyRebalancePlanningGateDecision(endpointDecision);
    t.equal(
      k1.scheduledDelays[k1.scheduledDelays.length - 1],
      rebalancerK1.getPriorityRetryDelayMs(),
      'the 5s cadence check remains armed while endpoints settle',
    );

    // Publishing the joiner's endpoint rows clears the gate predicate.
    cache.applySystemTableChange(
      'node_endpoints', CDC_OPERATION.INSERT, {...JOINER_NODE_ENDPOINT_ROW},
    );
    t.equal(
      rebalancerK1.getCriticalSystemTopologySettlingBlocker(),
      null,
      'publishing the endpoint rows clears the endpoint-visibility blocker',
    );

    // A false ready-lease must not level-trigger progress: only the
    // transition to ready is a wake.
    await awaitCacheNotifications();
    t.same(k1.enqueuedReasons,
      [REASON_NODE_BECAME_READY, REASON_NODE_BECAME_READY],
      'ready-lease and endpoint publications each reach the subscription');
    k1.enqueuedReasons.length = 0;
    cache.applySystemTableChange(
      'nodes', CDC_OPERATION.UPDATE, {
        ...NODE_ROW_ACTIVE_NOT_READY,
        last_heartbeat: OBSERVATION_NOW_MS + 1,
        updated_at: OBSERVATION_NOW_MS + 1,
      },
    );
    await awaitCacheNotifications();
    t.equal(cache.get('nodes', JOINER_NODE_ID).connection_state,
      NODE_ROW_ACTIVE_NOT_READY.connection_state,
      'the negative publication is applied to the real cache');
    t.equal(
      k1.enqueuedReasons.length,
      0,
      'no spurious wake for a genuinely unsettled node',
    );
  },
);

// Critical-system endpoint visibility owns the bootstrap transport only.
// sys-postgres-wire is an optional runtime service (replica_count defaults
// to 0) whose service_endpoints row exists only after the runtime-service
// rebalancer places it; it is never an input to topology settling. A
// non-priority system partition has no readiness backfill, so with zero
// postgres-wire rows the old predicate held its planning forever.
const NODES_PARTITION = 'nodes-p1';

function createFormedThreeNodeCache() {
  const cache = createSharedCache();
  cache.applySystemTableChange('partitions', CDC_OPERATION.INSERT, {
    partition_id: NODES_PARTITION,
    table_id: 'nodes',
    replica_count: 3,
  });
  cache.applySystemTableChange(
    'nodes', CDC_OPERATION.UPDATE, {...NODE_ROW_ACTIVE_READY},
  );
  cache.applySystemTableChange(
    'node_endpoints', CDC_OPERATION.INSERT, {...JOINER_NODE_ENDPOINT_ROW},
  );
  return cache;
}

test(
  'critical topology settling ignores postgres-wire endpoints for a non-priority system partition',
  async (t) => {
    initializeTestEnvironment();
    const cache = createFormedThreeNodeCache();
    const rebalancer = createRebalancer(cache, NODES_PARTITION);
    t.teardown(() => rebalancer.shutdown());
    rebalancer.messageRouter.getConnectedNodes =
      () => [SEED_NODE_ID, JOINER_NODE_ID];

    t.equal(
      rebalancer.getCriticalSystemTopologySettlingBlocker(),
      null,
      'every active node publishes its websocket endpoint, so nothing settles',
    );
    t.end();
  },
);

test(
  'critical topology settling still fails closed without websocket endpoints',
  async (t) => {
    initializeTestEnvironment();
    const cache = createFormedThreeNodeCache();
    cache.applySystemTableChange(
      'node_endpoints', CDC_OPERATION.DELETE, {...JOINER_NODE_ENDPOINT_ROW},
    );
    const rebalancer = createRebalancer(cache, NODES_PARTITION);
    t.teardown(() => rebalancer.shutdown());
    rebalancer.messageRouter.getConnectedNodes =
      () => [SEED_NODE_ID, JOINER_NODE_ID];

    const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
    t.equal(blocker?.reason, ENDPOINT_BLOCKER_REASON);
    t.same(blocker.missingNodeEndpointNodeIds, [JOINER_NODE_ID]);
    t.equal(
      'missingPostgresWireNodeIds' in blocker,
      false,
      'the blocker carries no postgres-wire visibility field',
    );
    t.end();
  },
);
