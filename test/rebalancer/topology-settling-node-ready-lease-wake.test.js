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
 * the gate predicate itself is CLEAR. But the priority rebalancer's only
 * cache listener (`handlePriorityRecoveryVisibilityEvent` ->
 * `buildPriorityRecoveryVisibilityRebalanceDecision`) matches only SERVICES
 * and REPLICA_OPERATIONS rows. The NODES / endpoint publication produces no
 * level-trigger, so the deferred K+1 rebalancer still waits out the full
 * getPriorityRetryDelayMs (= CRITICAL_CHECK_DELAY_MS = 5000) poll.
 *
 * These tests reproduce the CAUSAL SEQUENCE, not 60s of wall-clock:
 *  - the gate predicate is proven to defer (a ~5000ms timer) while the
 *    readiness/endpoint facts are false, and to clear the moment they are
 *    true;
 *  - the defer is proven to be a scheduling delay, not absence of work.
 * GREEN completes the existing level-trigger: the same readiness/endpoint
 * publication reaches K+1's rebalancer in the same logical step, while the
 * 5s poll remains armed as the fallback.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  EntityType,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const SEED_NODE_ID = 'node-seed';
const JOINER_NODE_ID = 'node-joiner';
const PARTITION_K = 'control_plane_publications-p1';
const PARTITION_K1 = 'replica_operations-p1';
const LIVE_LEASE_EXPIRES_AT_MS = 1_900_000_000_000;
const NODE_ROW_ACTIVE_NOT_READY = Object.freeze({
  node_id: JOINER_NODE_ID,
  status: 'active',
  connection_state: 'connected',
  ready_lease_expires_at: 0,
});
const NODE_ROW_ACTIVE_READY = Object.freeze({
  node_id: JOINER_NODE_ID,
  status: 'active',
  connection_state: 'ready',
  ready_lease_expires_at: LIVE_LEASE_EXPIRES_AT_MS,
});
const JOINER_NODE_ENDPOINT_ROW = Object.freeze({
  node_id: JOINER_NODE_ID,
  transport_type: 'ws',
  status: 'active',
});
const JOINER_SERVICE_ENDPOINT_ROW = Object.freeze({
  node_id: JOINER_NODE_ID,
  service_id: 'sys-postgres-wire',
  health_status: 'healthy',
});
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
  const tables = {
    nodes: new Map([
      [SEED_NODE_ID, {
        node_id: SEED_NODE_ID,
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: LIVE_LEASE_EXPIRES_AT_MS,
      }],
      [JOINER_NODE_ID, {...NODE_ROW_ACTIVE_NOT_READY}],
    ]),
    partitions: new Map([
      [PARTITION_K, {
        partition_id: PARTITION_K,
        table_id: 'control_plane_publications',
        replica_count: 5,
      }],
      [PARTITION_K1, {
        partition_id: PARTITION_K1,
        table_id: 'replica_operations',
        replica_count: 5,
      }],
    ]),
    node_endpoints: new Map([
      [SEED_NODE_ID, {
        node_id: SEED_NODE_ID,
        transport_type: 'ws',
        status: 'active',
      }],
    ]),
    service_endpoints: new Map([
      [SEED_NODE_ID, {
        node_id: SEED_NODE_ID,
        service_id: 'sys-postgres-wire',
        health_status: 'healthy',
      }],
    ]),
    replica_operations: new Map(),
    services: new Map(),
    tables: new Map(),
  };
  const cache = {
    get: (tableName, key) => tables[tableName]?.get(key) || null,
    getAll: (tableName) =>
      tables[tableName] ? [...tables[tableName].values()] : [],
    filter: (tableName, predicate) =>
      (tables[tableName] ? [...tables[tableName].values()] : [])
        .filter(predicate),
  };
  return {cache, tables};
}

function buildReadinessSnapshot(cache, nodeId) {
  const nodeRow = cache.get('nodes', nodeId);
  const eligible = nodeRow?.connection_state === 'ready' &&
    Number(nodeRow?.ready_lease_expires_at) > 0;
  return {
    nodeId,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: eligible,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: eligible,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: eligible,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: eligible,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: eligible,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: eligible,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]: eligible,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: eligible,
    },
    reasons: [],
  };
}

function createRebalancer(cache, partitionId) {
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
      getPolicyForPartition: () => ({targetReplicaCount: 5}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => [SEED_NODE_ID],
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {executeQuery: async () => ({success: true, rows: []})},
    controlPlaneReadinessService: {
      getNodeReadinessSync: (nodeId) =>
        buildReadinessSnapshot(cache, nodeId),
    },
    nowFn: () => 1_800_000_000_000,
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

// Drive the NODES ready-lease cache event through the visibility decision.
// In 'red' mode the node-readiness/endpoint branches are neutralized to the
// pre-fix behavior (only SERVICES / REPLICA_OPERATIONS are visibility
// progress); in 'green' mode the real decision — including the completed
// node-readiness edge — is exercised.
function driveNodeReadyLeaseEvent(rebalancerK1, mode) {
  if (mode === 'green') {
    return rebalancerK1.handlePriorityRecoveryVisibilityEvent(
      buildNodeReadyLeaseCacheEvent(),
    );
  }
  const decision = rebalancerK1.buildPriorityRecoveryVisibilityRebalanceDecision(
    buildNodeReadyLeaseCacheEvent(),
  );
  const preFixVisibilityProgress = decision.evidence.priorityPartition ===
    true &&
    (
      (
        decision.evidence.tableMatches === true &&
        decision.evidence.partitionMatches === true &&
        decision.evidence.progressPartitionService === true
      ) ||
      (
        decision.evidence.operationTableMatches === true &&
        decision.evidence.terminalReplicaOperation === true
      )
    );
  if (preFixVisibilityProgress !== true) {
    return false;
  }
  rebalancerK1.enqueueRebalanceCheck(decision.reconcileReason);
  return true;
}

// The joiner's readiness + endpoint facts become true in the shared store:
// the NODES row gains a live ready-lease and the canonical WebSocket /
// postgres-wire endpoint rows appear. This is the same publication the real
// heartbeat / endpoint writers produce once the joiner's first critical
// replica reaches voter-ready and it begins heartbeating.
function publishJoinerReadinessAndEndpoints(tables) {
  tables.nodes.set(JOINER_NODE_ID, {...NODE_ROW_ACTIVE_READY});
  tables.node_endpoints.set(JOINER_NODE_ID, {...JOINER_NODE_ENDPOINT_ROW});
  tables.service_endpoints.set(
    JOINER_NODE_ID,
    {...JOINER_SERVICE_ENDPOINT_ROW},
  );
}

function buildNodeReadyLeaseCacheEvent() {
  return {
    tableName: 'nodes',
    operation: 'update',
    data: {...NODE_ROW_ACTIVE_READY},
  };
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
  const {cache, tables} = createSharedCache();
  const rebalancerK = createRebalancer(cache, PARTITION_K);
  const rebalancerK1 = createRebalancer(cache, PARTITION_K1);
  rebalancerK.enqueueRebalanceCheck = () => true;
  rebalancerK.enqueueMembershipPublicationReconcile = () => true;
  const k1 = createDeferRecorder(rebalancerK1);
  return {tables, rebalancerK, rebalancerK1, k1};
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
  'RED: the readiness/endpoint publication produces no level-trigger, so ' +
    'partition K+1 waits out the 5s poll even though its gate is clear',
  async (t) => {
    const harness = createStaggeredJoinerHarness();
    const {tables, rebalancerK, rebalancerK1, k1} = harness;
    await assertJoinerBlocksK1BehindFiveSecondPoll(t, harness);

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
    publishJoinerReadinessAndEndpoints(tables);
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
    const handled = driveNodeReadyLeaseEvent(rebalancerK1, 'red');
    t.equal(
      handled,
      false,
      'RED: the NODES ready-lease update is not visibility progress for the priority lane',
    );
    t.equal(
      k1.enqueuedReasons.length,
      0,
      'RED: no level-trigger reaches partition K+1 for the readiness publication',
    );
  },
);

test(
  'GREEN: the same readiness/endpoint publication level-triggers partition ' +
    'K+1 in the same logical step, without waiting for the 5s poll',
  async (t) => {
    const harness = createStaggeredJoinerHarness();
    const {tables, rebalancerK, rebalancerK1, k1} = harness;
    await assertJoinerBlocksK1BehindFiveSecondPoll(t, harness);
    t.equal(
      completePartitionKReplicaOnJoiner(rebalancerK),
      true,
      'partition K operation completion reaches the existing rebalancer lane',
    );
    publishJoinerReadinessAndEndpoints(tables);
    t.equal(
      await rebalancerK1.resolveTopologySettlingPlanningGateDecision(),
      null,
      'the clearing predicate is satisfied by the published facts',
    );

    const handled = driveNodeReadyLeaseEvent(rebalancerK1, 'green');
    t.equal(
      handled,
      true,
      'GREEN: the NODES ready-lease transition now reaches the priority lane',
    );
    t.same(
      k1.enqueuedReasons,
      [REASON_NODE_BECAME_READY],
      'GREEN: K+1 re-evaluates the topology-settling gate in the same logical step',
    );
    t.equal(
      rebalancerK1.getCriticalSystemTopologySettlingBlocker(),
      null,
      'the level-trigger drives the consumer whose gate predicate is now clear',
    );
  },
);

test(
  'the endpoint publication also clears the gate, and the 5s poll remains ' +
    'the fallback with the predicate unchanged',
  async (t) => {
    initializeTestEnvironment();
    const {cache, tables} = createSharedCache();
    const rebalancerK1 = createRebalancer(cache, PARTITION_K1);
    const k1 = createDeferRecorder(rebalancerK1);

    // Lease published but endpoints not yet: the gate blocks on
    // ENDPOINT_VISIBILITY_INCOMPLETE, still deferring to the 5s poll.
    tables.nodes.set(JOINER_NODE_ID, {...NODE_ROW_ACTIVE_READY});
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
      'the 5s poll remains armed as the fallback while endpoints settle',
    );

    // Publishing the joiner's endpoint rows clears the gate predicate.
    publishJoinerReadinessAndEndpoints(tables);
    t.equal(
      rebalancerK1.getCriticalSystemTopologySettlingBlocker(),
      null,
      'publishing the endpoint rows clears the endpoint-visibility blocker',
    );

    // A false ready-lease must not level-trigger progress: only the
    // transition to ready is a wake.
    k1.enqueuedReasons.length = 0;
    const falseTrigger = rebalancerK1.handlePriorityRecoveryVisibilityEvent({
      tableName: 'nodes',
      operation: 'update',
      data: {...NODE_ROW_ACTIVE_NOT_READY},
    });
    t.equal(
      falseTrigger,
      false,
      'a not-ready NODES row does not produce a false level-trigger',
    );
    t.equal(
      k1.enqueuedReasons.length,
      0,
      'no spurious wake for a genuinely unsettled node',
    );
  },
);
