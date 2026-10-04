/**
 * V3a (one-spread-authority verification): while a priority partition is
 * unspread - the phase the census-only rule makes longer - a joiner's NODES
 * heartbeat and ready-lease writes are never deferred behind published
 * convergence (`query_admission_deferred`).
 *
 * Real path: HeartbeatService (write decision and publication mode) ->
 * NodeLifecyclePublication (the NODES lifecycle owner: next state, lease,
 * write class) -> ControlPlaneSystemTableGateway (the local mutation
 * readiness admission). The readiness the gateway consults is built by the
 * real readiness owners from a durable spread gap, so stable BACKGROUND
 * mutation is deferred for the whole run. Injected clock, 5 s ticks.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {NodeLifecyclePublication} from
  '../../src/control-plane/node-lifecycle-publication.js';
import {NodeReadyLeaseAuthority} from
  '../../src/control-plane/node-ready-lease-authority.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  getLocalControlPlaneMutationReadinessBlocker,
} from '../../src/control-plane/control-plane-mutation-readiness.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/publication-owner-constants.js';
import {
  buildPublicationRecoveryGateSnapshot,
} from '../../src/control-plane/publication-recovery-gate.js';
import {
  buildProjectionReadinessContract,
} from '../../src/control-plane/projection-readiness-state.js';

const JOINER_NODE_ID = 'node-joiner';
const JOINER_ADDRESS = '10.0.0.4:8080';
const BOOT_INCARNATION = 3;
const PRIORITY_PARTITION_ID = 'replica_operations-p1';
const TICK_MS = 5000;
const START_MS = 1_000_000;
const QUERY_ADMISSION_DEFERRED = 'query_admission_deferred';
const READY_LEASE_MS = NodeReadyLeaseAuthority.fromConfiguration()
  .readyLeaseMs;

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function readyDimensions() {
  return Object.fromEntries(
    Object.values(CONTROL_PLANE_READINESS_DIMENSION)
      .map((dimension) => [dimension, true]));
}

// The readiness a node holds while the published census shows a spread gap.
function buildSpreadPendingReadiness() {
  const summary = Object.freeze({
    satisfied: false,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 3,
    totalPriorityPartitionCount: 1,
    missingPartitionIds: [PRIORITY_PARTITION_ID],
    blockedPartitions: [{
      partitionId: PRIORITY_PARTITION_ID,
      readyReplicaCount: 2,
      readyDistinctNodeCount: 2,
      requiredDistinctNodeCount: 3,
      spreadGap: 1,
    }],
    blockedPartitionCount: 1,
    largestSpreadGap: 1,
    totalSpreadGap: 1,
  });
  const gate = buildPublicationRecoveryGateSnapshot({
    publicationEpoch: 7,
    publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    requiredAckNodeIds: [JOINER_NODE_ID],
    acknowledgedNodeIds: [JOINER_NODE_ID],
    priorityRecoveryReasonCodes: [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    ],
    priorityPartitionSummary: summary,
  });
  const dimensions = readyDimensions();
  const priorityControlPlaneRecovery = new ControlPlaneReadinessService({
    nodeId: JOINER_NODE_ID,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
      onCacheChange() {},
    },
  }).getPriorityControlPlaneRecoveryState({
    nodeId: JOINER_NODE_ID,
    dimensions,
    membershipPublicationPlanningSnapshot: {
      publicationEpoch: 7,
      publicationStatus: gate.publicationStatus,
      requiredAckNodeIds: [JOINER_NODE_ID],
      acknowledgedNodeIds: [JOINER_NODE_ID],
      priorityRecoveryReasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      priorityPartitionSummary: summary,
      publicationRecoveryGate: gate,
    },
  });
  return {
    dimensions,
    reasons: [],
    projectionReadinessContract: buildProjectionReadinessContract({
      dimensions,
      membershipPublication: gate,
      priorityControlPlaneRecovery,
      runtimeServeEligible: true,
    }),
  };
}

// One durable NODES row the lifecycle owner reads and CASes; the cache the
// heartbeat reads follows it.
function createJoinerWorld(clock) {
  const world = {
    lifecycleReady: false,
    row: {
      node_id: JOINER_NODE_ID,
      node_address: JOINER_ADDRESS,
      status: 'joining',
      connection_state: 'connected',
      last_heartbeat: clock.now() - TICK_MS,
      ready_lease_expires_at: null,
      boot_incarnation: BOOT_INCARNATION,
      created_at: clock.now(),
    },
    // Born by the join-time endpoint write at this boot incarnation.
    endpointRow: {
      endpoint_id: `ep-${JOINER_NODE_ID}-ws`,
      node_id: JOINER_NODE_ID,
      transport_type: 'ws',
      address: JOINER_ADDRESS,
      priority: 0,
      metadata: '{}',
      status: 'active',
      boot_incarnation: BOOT_INCARNATION,
      created_at: clock.now() - TICK_MS,
      updated_at: clock.now() - TICK_MS,
    },
    attempts: [],
    heartbeatErrors: [],
  };
  const readiness = buildSpreadPendingReadiness();
  const cdcIntegrationService = {
    executeAuthoritativeSystemTableRead: async () =>
      ({success: true, rows: [{...world.row}]}),
    updateSystemTableRow: async (tableName, _where, data) => {
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
        world.row = {...world.row, ...data};
      }
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    upsertSystemTableRow: async () => ({success: true}),
    insertSystemTableRow: async () => ({success: true}),
  };
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: JOINER_NODE_ID,
    cdcIntegrationService,
    sqlQueryEngine: null,
    systemTableCache: null,
    messageRouter: null,
    controlPlaneReadinessService: {
      getNodeReadinessSync: () => readiness,
    },
  });
  const submitMutation = gateway.submitMutation.bind(gateway);
  gateway.submitMutation = async (mutation, options = {}) => {
    const result = await submitMutation(mutation, options);
    world.attempts.push({
      atMs: clock.now(),
      tableName: mutation?.tableName || null,
      workClass: options?.workClass || null,
      error: result?.error || null,
      success: result?.success !== false,
    });
    return result;
  };
  const service = new HeartbeatService({
    nodeId: JOINER_NODE_ID,
    nodeAddress: JOINER_ADDRESS,
    bootIncarnation: BOOT_INCARNATION,
    cdcIntegrationService,
    controlPlaneSystemTableGateway: gateway,
    nodeLifecyclePublication: new NodeLifecyclePublication({
      gateway,
      leaseAuthority: NodeReadyLeaseAuthority.fromConfiguration(),
      now: clock.now,
    }),
    systemTableCache: {
      get: (tableName, key) => {
        if (tableName === SYSTEM_TABLE_NAME.NODES && key === JOINER_NODE_ID) {
          return {...world.row};
        }
        return tableName === SYSTEM_TABLE_NAME.NODE_ENDPOINTS &&
          key === world.endpointRow.endpoint_id ?
          {...world.endpointRow} :
          null;
      },
    },
    isNodeLifecycleReady: () => world.lifecycleReady,
    now: clock.now,
  });
  // The heartbeat timer's contract: a deferred publication throws a
  // deferRetry error that the next tick retries; record it, never stop.
  const tick = async () => {
    try {
      await service.sendHeartbeat(null, null);
    } catch (error) {
      world.heartbeatErrors.push({atMs: clock.now(), code: error?.code});
    }
  };
  return {world, tick, readiness};
}

test('V3a: an unspread priority partition never defers the joiner NODES heartbeat or its READY lease',
  async (t) => {
    initEnv();
    let nowMs = START_MS;
    const clock = {now: () => nowMs};
    const {world, tick, readiness} = createJoinerWorld(clock);
    try {
      t.same(
        getLocalControlPlaneMutationReadinessBlocker({
          nodeId: JOINER_NODE_ID,
          requirePublishedConvergence: true,
          controlPlaneReadinessService: {
            getNodeReadinessSync: () => readiness,
          },
        })?.failedDimensions,
        ['publishedConvergencePending'],
        'precondition: stable background mutation is deferred for the whole run',
      );

      // CONNECTED liveness while the join barrier withholds READY.
      for (let index = 0; index < 3; index += 1) {
        await tick();
        nowMs += TICK_MS;
      }
      // Join completes: the local lifecycle is READY; the next heartbeat is
      // the READY promotion that grants the lease.
      world.lifecycleReady = true;
      const promotionAtMs = nowMs;
      let readyAtMs = null;
      let lapsedAtMs = null;
      for (let index = 0; index < 12; index += 1) {
        await tick();
        if (readyAtMs === null && world.row.connection_state === 'ready') {
          readyAtMs = nowMs;
        }
        nowMs += TICK_MS;
        if (
          readyAtMs !== null &&
          lapsedAtMs === null &&
          !(Number(world.row.ready_lease_expires_at) > nowMs)
        ) {
          lapsedAtMs = nowMs;
        }
      }

      const nodesAttempts = world.attempts.filter(
        (attempt) => attempt.tableName === SYSTEM_TABLE_NAME.NODES);
      const deferred = world.attempts.filter(
        (attempt) => attempt.error === QUERY_ADMISSION_DEFERRED);
      t.ok(nodesAttempts.length > 0, 'NODES heartbeats were written');
      t.same(world.heartbeatErrors, [], 'no heartbeat publication failed');
      t.same(deferred, [],
        'no NODES or NODE_ENDPOINTS heartbeat write is query_admission_deferred while spread is pending');
      t.equal(readyAtMs, promotionAtMs,
        'the READY promotion lands on the first heartbeat after join completes');
      t.equal(lapsedAtMs, null,
        `the ${READY_LEASE_MS} ms ready lease never lapses while spread is pending`);
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
