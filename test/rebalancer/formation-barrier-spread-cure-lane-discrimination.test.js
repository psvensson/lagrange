import {createMockCoordinator} from './test-helpers.js';
/**
 * Priority recovery lane-discrimination witness.
 *
 * The fixture models three READY nodes and two startup-authority cohort
 * members. Pre-READY cohort members (status: 'joining', connection_state:
 * 'connected', ready_lease_expires_at: 0) are not placement targets and
 * remain topology-settling blockers until they publish READY leases; once
 * READY, they are admitted by the recovery-target predicate without blocking
 * topology settling.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  REBALANCE_PLANNING_GATE,
  TOPOLOGY_SETTLING_PLANNING_STATE,
} from '../../src/rebalancer/rebalancer-planning-gate-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {withRegisteredIncarnations} from
  '../test-helpers/endpoint-incarnation-fixture.js';
import {partialReadinessFake} from '../helpers/readiness-service-fixture.js';

const FAKE_NOW_MS = 1_800_000_000_000;
const READY_LEASE_EXPIRES_AT_MS = FAKE_NOW_MS + 600_000;
const SEED_NODE_ID = 'formation-seed';
const READY_NODE_IDS = Object.freeze([
  SEED_NODE_ID,
  'formation-ready-2',
  'formation-ready-3',
]);
const COHORT_NODE_IDS = Object.freeze([
  'formation-cohort-4',
  'formation-cohort-5',
]);
const STARTUP_AUTHORITY_NODE_IDS = Object.freeze([
  ...READY_NODE_IDS,
  ...COHORT_NODE_IDS,
]);
const PRIORITY_PARTITION_ID = 'control_plane_publications-p1';
const OPEN_SPREAD_GAP = 1;
const TARGET_REPLICA_COUNT = 3;
const TERMINAL_OPERATION_ID = 'formation-cure-add-1';

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

function createNodeRows() {
  return [
    ...READY_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: READY_LEASE_EXPIRES_AT_MS,
    })),
    ...COHORT_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: 'joining',
      connection_state: 'connected',
      ready_lease_expires_at: 0,
    })),
  ];
}

function createCache() {
  const rows = withRegisteredIncarnations({
    nodes: createNodeRows(),
    partitions: [
      {
        partition_id: PRIORITY_PARTITION_ID,
        table_id: 'control_plane_publications',
      },
    ],
    tables: [],
    services: [],
    replica_operations: [],
    node_endpoints: READY_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      transport_type: 'ws',
      status: 'active',
    })),
    service_endpoints: READY_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      service_id: 'sys-postgres-wire',
      health_status: 'healthy',
    })),
    control_plane_publications: [],
  });
  return {
    get(tableName, key) {
      return (rows[tableName] || []).find((row) =>
        row.node_id === key || row.partition_id === key,
      ) || null;
    },
    getAll(tableName) {
      return rows[tableName] || [];
    },
    filter(tableName, predicate) {
      return (rows[tableName] || []).filter(predicate);
    },
  };
}

function buildReadiness(nodeId) {
  const ready = READY_NODE_IDS.includes(nodeId);
  return {
    nodeId,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: ready,
    },
    reasons: ready ? [] : [{code: 'ready_lease_missing'}],
  };
}

function createReadinessService(clock) {
  const publicationRow = {
    status: 'PUBLISHED',
    priorityPartitionSummary: {
      satisfied: false,
      blockedPartitions: buildOpenSpreadBlocker().blockedPartitions,
    },
  };
  return partialReadinessFake({
    answerCommittedNodes() {
      return {
        state: 'ready',
        epoch: {
          publicationEpoch: 1,
          publicationId: 'cluster_membership-1',
          readAtMs: 0,
        },
        nodeRows: createNodeRows(),
      };
    },
    getNodeReadinessSync: buildReadiness,
    membershipPublicationService: {
      getLatestClusterPublicationSync: () => publicationRow,
      getLatestPublishedClusterPublicationSync: () => publicationRow,
    },
    getStartupAuthoritySnapshotSync() {
      return {
        authorityAvailable: true,
        ready: false,
        state: 'recovery_pending',
        priorityRecoveryActive: true,
        priorityRecoveryReasonCodes: ['priority_partitions_not_spread'],
        canonicalStartupNodeIds: [...STARTUP_AUTHORITY_NODE_IDS],
      };
    },
  }, clock);
}

function buildOpenSpreadBlocker() {
  return {
    requiredDistinctNodeCount: TARGET_REPLICA_COUNT,
    blockedPartitions: [{
      partitionId: PRIORITY_PARTITION_ID,
      expectedReplicaCount: TARGET_REPLICA_COUNT,
      readyReplicaCount: TARGET_REPLICA_COUNT,
      readyDistinctNodeCount: TARGET_REPLICA_COUNT - OPEN_SPREAD_GAP,
      spreadGap: OPEN_SPREAD_GAP,
      exclusionReasonCounts: {ready_lease_missing: COHORT_NODE_IDS.length},
    }],
  };
}

function createRebalancer(
  entityId = PRIORITY_PARTITION_ID,
  options = {},
) {
  const ownerClock = () => FAKE_NOW_MS;
  const controlPlaneReadinessService = createReadinessService(ownerClock);
  const rebalancer = new UnifiedRebalancer({
    entityId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    systemTableCache: createCache(),
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({minReplicaCount: 3, targetReplicaCount: TARGET_REPLICA_COUNT}),
    },
    messageRouter: {
      getConnectionState: (nodeId) =>
        options.disconnectCohort === true && COHORT_NODE_IDS.includes(nodeId) ?
          'disconnected' :
          'connected',
      getConnectedNodes: () => [...STARTUP_AUTHORITY_NODE_IDS],
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: createMockCoordinator({controlPlaneReadinessService}),
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService,
    nowFn: ownerClock,
    randomSource: {random: () => 0},
  });
  rebalancer.getControlPlanePrioritySpreadBlocker = buildOpenSpreadBlocker;
  return rebalancer;
}

function assertUnleasedCohortNotAdmitted(t, rebalancer) {
  const availableNodeIds = rebalancer.getAvailableNodes()
    .map((node) => node.node_id);
  for (const cohortNodeId of COHORT_NODE_IDS) {
    t.notOk(
      availableNodeIds.includes(cohortNodeId),
      `${cohortNodeId} is not admitted before publishing a READY lease`,
    );
  }
}

test('pre-ready cohort members are not placement targets and defer topology ' +
  'settling until READY', async (t) => {
  initializeTestEnvironment();
  const rebalancer = createRebalancer();

  assertUnleasedCohortNotAdmitted(t, rebalancer);
  const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
  t.equal(
    blocker?.reason,
    'node_ready_lease_incomplete',
    'unleased cohort members produce NODE_READY_LEASE_INCOMPLETE',
  );

  const decision = await rebalancer.resolveTopologySettlingPlanningGateDecision();
  t.equal(
    decision?.gate,
    REBALANCE_PLANNING_GATE.TOPOLOGY_SETTLING,
    'unleased cohort members defer topology settling until their READY lease is published',
  );
});

test('target-in-flight: an in-flight operation on the current partition ' +
  'retains serialization while other partitions do not defer', (t) => {
  initializeTestEnvironment();
  const rebalancer = createRebalancer();
  assertUnleasedCohortNotAdmitted(t, rebalancer);
  const targetNodeId = COHORT_NODE_IDS[0];
  const blocker = {
    reason: 'topology_operations_in_flight',
    inFlightReplicaOperations: 1,
    inFlightReplicaOperationDetails: [{
      operationId: TERMINAL_OPERATION_ID,
      partitionId: PRIORITY_PARTITION_ID,
      targetNodeId,
      operationType: 'add',
    }],
  };
  const evaluationContext = {
    resolvePriorityRecoveryOperationCreationGate: () => ({
      operationCreationRequired: true,
      operationCreationPartitionId: PRIORITY_PARTITION_ID,
      operationCreationScope: 'current_partition',
    }),
  };

  const snapshot = rebalancer.buildTopologySettlingPlanningGateSnapshot(
    blocker,
    evaluationContext,
  );
  t.equal(
    snapshot.shouldDefer,
    true,
    `in-flight operation on ${PRIORITY_PARTITION_ID} retains serialization; state=${snapshot.planningState}`,
  );
  t.equal(
    snapshot.planningState,
    TOPOLOGY_SETTLING_PLANNING_STATE.TOPOLOGY_OPERATION_TARGET_IN_FLIGHT,
    'an in-flight operation on the target partition defers planning',
  );

  const otherPartitionSnapshot = rebalancer.buildTopologySettlingPlanningGateSnapshot(
    {
      ...blocker,
      inFlightReplicaOperationDetails: [{
        ...blocker.inFlightReplicaOperationDetails[0],
        partitionId: 'other-priority-p1',
      }],
    },
    evaluationContext,
  );
  t.equal(
    otherPartitionSnapshot.shouldDefer,
    false,
    'operations on other partitions do not block current-partition operation creation',
  );
  t.end();
});

test('operation-terminal edge resets an escalated settle interval ' +
  'to the priority base cadence', (t) => {
  initializeTestEnvironment();
  const rebalancer = createRebalancer();
  rebalancer.isLeader = true;
  const enqueuedReasons = [];
  rebalancer.enqueueRebalanceCheck = (reason) => {
    enqueuedReasons.push(reason);
    return true;
  };
  rebalancer.currentInterval = rebalancer.maxInterval;

  const handled = rebalancer.handleCoordinatorProgressEvent(
    REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
    {
      operation: {
        operationId: TERMINAL_OPERATION_ID,
        entityType: EntityType.PARTITION,
        entityId: PRIORITY_PARTITION_ID,
        partitionId: PRIORITY_PARTITION_ID,
        targetNodeId: COHORT_NODE_IDS[0],
      },
    },
  );

  t.equal(handled, true, 'the existing terminal edge re-enqueues evaluation');
  t.equal(enqueuedReasons.length, 1, 'one terminal edge produces one wake');
  t.equal(
    rebalancer.currentInterval,
    rebalancer.getPriorityRetryDelayMs(),
    'terminal progress re-arms the next evaluation at base cadence',
  );

  rebalancer.currentInterval = rebalancer.maxInterval;
  const visibilityHandled = rebalancer.handlePriorityRecoveryVisibilityEvent({
    tableName: 'services',
    operation: 'UPDATE',
    data: {
      service_id: 'formation-cure-service',
      node_id: COHORT_NODE_IDS[0],
      partition_id: PRIORITY_PARTITION_ID,
      service_type: 'partition',
      status: 'active',
    },
  });
  t.equal(
    visibilityHandled,
    true,
    'the existing placement-visibility edge re-enqueues evaluation',
  );
  t.equal(
    rebalancer.currentInterval,
    rebalancer.getPriorityRetryDelayMs(),
    'placement visibility re-arms the next evaluation at base cadence',
  );
  t.end();
});

test('lane pin: settle-gate escalation binds while the blocked-spread ' +
  'sleep is not applicable to priority partitions', async (t) => {
  initializeTestEnvironment();
  const settlingRebalancer = createRebalancer(
    PRIORITY_PARTITION_ID,
    {disconnectCohort: true},
  );
  const baseSettleIntervalMs = settlingRebalancer.currentInterval;
  const settleDecision =
    await settlingRebalancer.resolveTopologySettlingPlanningGateDecision();

  t.equal(
    settleDecision?.gate,
    REBALANCE_PLANNING_GATE.TOPOLOGY_SETTLING,
    'the run-4 cohort state reaches topology settling',
  );
  t.ok(
    settleDecision.scheduleDelayMs > baseSettleIntervalMs,
    'topology settling consumes the escalating 75-120s interval lane',
  );

  const priorityRebalancer = createRebalancer();
  const prioritySpreadDecision =
    priorityRebalancer.resolvePrioritySpreadPlanningGateDecision();
  t.equal(
    prioritySpreadDecision,
    null,
    'the 70-80s blocked-spread branch is NOT_APPLICABLE to priority partitions',
  );
  t.not(
    settleDecision?.logContext?.planningState,
    TOPOLOGY_SETTLING_PLANNING_STATE.CLEAR,
    'lane discrimination remains pinned to the settle-gate state',
  );
});
