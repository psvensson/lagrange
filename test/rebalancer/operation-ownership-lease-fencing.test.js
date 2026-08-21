/**
 * Operation ownership lease + fencing regression tests (verified-audit
 * findings 5 and 14, quest operation-ownership-lease-fencing).
 *
 * Receipts:
 *
 * - durable-owner-lease-enforced: the schema's vestigial lease_expires_at
 *   column becomes the durable owner lease. The canonical write payloads
 *   (insert row / update data) carry a re-stamped lease heartbeat anchored
 *   to the operation's own updatedAt; the dedicated owner-lease touch
 *   persists lease_expires_at on a live row through the raw-SQL path; a
 *   LIVE lease held by a REMOTE owner fences priority-control-plane drain
 *   remote settlement even when the unfenced routing-readiness heuristic
 *   reports the owner unready, while an EXPIRED lease falls back to the
 *   heuristic. Red-on-revert: removing the lease stamp/touch or the
 *   lease-first fence in the drain-availability resolution flips these red.
 *
 * - orphan-op-adopted-by-fenced-successor: an incomplete operation on an
 *   ORDINARY partition whose recorded owner is remote was previously never
 *   resumed. The fenced recovery sweep adopts it once the durable lease is
 *   expired (or unfenced) and re-drives it through the gated lifecycle
 *   reconcile; a LIVE remote lease keeps it fenced out of the sweep.
 *   Red-on-revert: removing the adoption arm (or the lease fence in the
 *   adoption read) flips these red.
 *
 * - shutdown-joins-in-flight: shutdown bumps the ownership fence epoch and
 *   BOUNDEDLY awaits the in-flight owner lanes before releasing the retry
 *   registries — replacing flag-set + map-clear while continuations past an
 *   await proceed unguarded. Red-on-revert: removing the fence bump, the
 *   lane fence check, or the bounded join flips these red.
 */

import {setImmediate as waitForImmediate} from 'node:timers/promises';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  OPERATION_SHUTDOWN_JOIN_RESULT,
  joinInFlightOperationOwnerLanes,
} from '../../src/rebalancer/operation-owner-shutdown-join.js';
import {
  OPERATION_DRAIN_OWNER_AVAILABILITY,
  resolveOperationDrainOwnerAvailability,
} from '../../src/rebalancer/operation-owner-availability-policy.js';
import {
  REPLICA_OPERATION_OWNER_LEASE_ADOPTION,
  REPLICA_OPERATION_OWNER_LEASE_STATE,
  REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
  resolveOperationOwnerLeaseAdoption,
  resolveOperationOwnerLeaseState,
} from '../../src/rebalancer/replica-operation-owner-lease.js';
import {
  RebalanceCoordinator,
} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
  createOperation,
} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockCdcService,
  createMockControlPlaneSystemTableGateway,
  createMockMessageRouter,
  createMockPolicyService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'lease-node-local';
const TEST_REMOTE_NODE_ID = 'lease-node-remote';
const TEST_TARGET_NODE_ID = 'lease-node-target';
const ORDINARY_PARTITION_ID = 'p-lease-ordinary';

const LEASE_ANCHOR_MS = 10_000;
const LIVE_LEASE_EXPIRES_AT_MS =
  LEASE_ANCHOR_MS + REPLICA_OPERATION_OWNER_LEASE_TTL_MS;
const LIVE_LEASE_OBSERVED_AT_MS = LEASE_ANCHOR_MS + 1_000;
const EXPIRED_LEASE_OBSERVED_AT_MS = LIVE_LEASE_EXPIRES_AT_MS + 1_000;
const SHUTDOWN_JOIN_TIMEOUT_MS = 5_000;
const SHUTDOWN_JOIN_OBSERVATION_TURN_BUDGET = 20;

function initializeConfig() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
    },
  });
}

function buildOrdinaryAddOperation(overrides = {}) {
  const operation = createOperation({
    operationId: overrides.operationId || 'op-lease-ordinary',
    type: OperationType.ADD,
    partitionId: ORDINARY_PARTITION_ID,
    replicaId: `${ORDINARY_PARTITION_ID}-r9`,
    sourceNodeId: TEST_REMOTE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
  });
  operation.entityType = SERVICE_TYPE.PARTITION;
  operation.entityId = ORDINARY_PARTITION_ID;
  operation.workflowStep = WORKFLOW_STEP.SYNCING;
  operation.status = ReplicaStatus.SYNCING;
  operation.updatedAt = LEASE_ANCHOR_MS;
  operation.stepsHistory = [
    {step: WORKFLOW_STEP.PENDING, timestamp: LEASE_ANCHOR_MS - 1_000},
    {step: WORKFLOW_STEP.SYNCING, timestamp: LEASE_ANCHOR_MS},
  ];
  return Object.assign(operation, overrides);
}

function operationToRow(operation) {
  return {
    operation_id: operation.operationId,
    type: operation.type,
    partition_id: operation.partitionId,
    entity_type: operation.entityType,
    entity_id: operation.entityId,
    replica_id: operation.replicaId,
    target_claim_key: operation.targetClaimKey || null,
    source_node_id: operation.sourceNodeId,
    target_node_id: operation.targetNodeId,
    status: operation.status,
    workflow_step: operation.workflowStep,
    created_at: operation.createdAt,
    updated_at: operation.updatedAt,
    completed_at: operation.completedAt ?? null,
    lease_expires_at: operation.ownerLeaseExpiresAt ?? null,
    error_message: operation.errorMessage ?? null,
    steps_history: JSON.stringify(operation.stepsHistory || []),
  };
}

/**
 * Coordinator harness with an in-memory replica_operations store that
 * answers the lease-touch UPDATE and by-id/point reads, and records every
 * lease-touch write.
 */
function createLeaseCoordinatorHarness({
  nodeId = TEST_NODE_ID,
  operations = [],
} = {}) {
  const rowsByOperationId = new Map(
    operations.map((operation) => [
      operation.operationId,
      operationToRow(operation),
    ]),
  );
  const leaseTouchWrites = [];
  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes('UPDATE replica_operations') &&
        normalizedSql.includes('lease_expires_at = ?') &&
        !normalizedSql.includes('workflow_step = ?')
      ) {
        const [leaseExpiresAt, operationId] = params;
        const row = rowsByOperationId.get(operationId);
        if (!row || row.completed_at !== null) {
          return {success: true, changes: 0};
        }
        row.lease_expires_at = leaseExpiresAt;
        leaseTouchWrites.push({operationId, leaseExpiresAt});
        return {success: true, changes: 1};
      }
      if (normalizedSql.includes('FROM replica_operations')) {
        if (normalizedSql.includes('operation_id = ?')) {
          const row = rowsByOperationId.get(params[0]);
          return {success: true, rows: row ? [row] : []};
        }
        return {
          success: true,
          rows: Array.from(rowsByOperationId.values()),
        };
      }
      return {success: true, rows: []};
    },
  };
  const cache = createMockCache();
  const coordinator = new RebalanceCoordinator({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway(sqlQueryEngine),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
  coordinator.initialize();
  return {
    coordinator,
    rowsByOperationId,
    leaseTouchWrites,
  };
}

// ---------------------------------------------------------------------------
// durable-owner-lease-enforced
// ---------------------------------------------------------------------------

test(
  'durable owner lease: write payloads carry a re-stamped lease heartbeat',
  async (t) => {
    initializeConfig();
    const {coordinator} = createLeaseCoordinatorHarness();
    try {
      const operation = buildOrdinaryAddOperation();

      const row = coordinator.repository.buildReplicaOperationRow(operation);
      t.equal(
        row.lease_expires_at,
        LIVE_LEASE_EXPIRES_AT_MS,
        'the insert row stamps lease_expires_at anchored to updatedAt + TTL',
      );

      const updateData =
        coordinator.repository.buildReplicaOperationUpdateData(operation);
      t.equal(
        updateData.lease_expires_at,
        LIVE_LEASE_EXPIRES_AT_MS,
        'the update payload re-stamps lease_expires_at on every write',
      );

      const updateParams =
        coordinator.repository.buildReplicaOperationUpdateParams(operation);
      t.equal(
        updateParams.length,
        8,
        'the raw-SQL fallback update keeps the canonical 8-param shape ' +
          '(the lease rides the dedicated touch statement, never the ' +
          'transition shape)',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'durable owner lease: the owner-lease touch persists lease_expires_at ' +
    'on a live row and skips terminal rows',
  async (t) => {
    initializeConfig();
    const liveOperation = buildOrdinaryAddOperation({
      operationId: 'op-lease-live',
    });
    const terminalOperation = buildOrdinaryAddOperation({
      operationId: 'op-lease-terminal',
      completedAt: LEASE_ANCHOR_MS,
      workflowStep: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE,
    });
    const {coordinator, rowsByOperationId, leaseTouchWrites} =
      createLeaseCoordinatorHarness({
        operations: [liveOperation, terminalOperation],
      });
    try {
      const touched =
        await coordinator.repository.touchOperationOwnerLease(liveOperation);
      t.equal(touched, true, 'the lease touch lands on the live row');
      t.equal(leaseTouchWrites.length, 1, 'exactly one lease write issued');
      t.equal(
        rowsByOperationId.get(liveOperation.operationId).lease_expires_at,
        LIVE_LEASE_EXPIRES_AT_MS,
        'the persisted lease expiry is anchored to the row updatedAt + TTL',
      );

      const terminalTouched =
        await coordinator.repository.touchOperationOwnerLease(
          terminalOperation,
        );
      t.equal(terminalTouched, true, 'the touch statement still succeeds');
      t.equal(
        rowsByOperationId.get(terminalOperation.operationId)
          .lease_expires_at,
        null,
        'a terminal row is never leased (completed_at IS NULL guard)',
      );
      t.equal(
        leaseTouchWrites.length,
        1,
        'no lease write is recorded for the terminal row',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'durable owner lease: a live remote lease fences drain remote settlement ' +
    'past the unfenced routing-readiness heuristic',
  async (t) => {
    initializeConfig();
    const liveLeasedOperation = buildOrdinaryAddOperation({
      ownerLeaseExpiresAt: LIVE_LEASE_EXPIRES_AT_MS,
    });
    const routingUnready = () => false;

    const liveLeaseVerdict = resolveOperationDrainOwnerAvailability({
      ownerNodeId: TEST_REMOTE_NODE_ID,
      nodeId: TEST_NODE_ID,
      operation: liveLeasedOperation,
      nowMs: LIVE_LEASE_OBSERVED_AT_MS,
      isOwnerRoutingReady: routingUnready,
    });
    t.equal(
      liveLeaseVerdict.state,
      OPERATION_DRAIN_OWNER_AVAILABILITY.FENCED_BY_LIVE_LEASE,
      'a live remote lease is the typed fence state (never raw null)',
    );
    t.equal(
      liveLeaseVerdict.unavailable,
      true,
      'the owner stays unavailable to remote settlement while its lease ' +
        'lives even though routing readiness reports it unready',
    );

    const expiredLeaseVerdict = resolveOperationDrainOwnerAvailability({
      ownerNodeId: TEST_REMOTE_NODE_ID,
      nodeId: TEST_NODE_ID,
      operation: liveLeasedOperation,
      nowMs: EXPIRED_LEASE_OBSERVED_AT_MS,
      isOwnerRoutingReady: routingUnready,
    });
    t.equal(
      expiredLeaseVerdict.state,
      OPERATION_DRAIN_OWNER_AVAILABILITY.HEURISTIC_UNAVAILABLE,
      'an expired lease falls back to the routing-readiness heuristic',
    );
    t.equal(
      expiredLeaseVerdict.unavailable,
      true,
      'the heuristic verdict stands once the lease lapses',
    );

    const heuristicReadyVerdict = resolveOperationDrainOwnerAvailability({
      ownerNodeId: TEST_REMOTE_NODE_ID,
      nodeId: TEST_NODE_ID,
      operation: liveLeasedOperation,
      nowMs: EXPIRED_LEASE_OBSERVED_AT_MS,
      isOwnerRoutingReady: () => true,
    });
    t.equal(
      heuristicReadyVerdict.unavailable,
      false,
      'a routing-ready owner with a lapsed lease is available again',
    );
  },
);

test(
  'durable owner lease: the workflow owner drain probe consults the ' +
    'persisted lease before the heuristic',
  async (t) => {
    initializeConfig();
    const {coordinator} = createLeaseCoordinatorHarness();
    try {
      const owner = coordinator.workflowOwner;
      owner.isNodeReadyForRouting = () => false;

      const liveLeasedOperation = buildOrdinaryAddOperation({
        ownerLeaseExpiresAt:
          owner.resolveTimeoutCheckNowMs() +
            REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
      });
      t.equal(
        owner.isPriorityRecoveryDrainOwnerUnavailable(
          TEST_REMOTE_NODE_ID,
          liveLeasedOperation,
        ),
        true,
        'a live lease keeps the drain owner fenced even with the ' +
          'heuristic reporting unready',
      );

      const expiredLeaseOperation = buildOrdinaryAddOperation({
        ownerLeaseExpiresAt: LEASE_ANCHOR_MS,
      });
      t.equal(
        owner.isPriorityRecoveryDrainOwnerUnavailable(
          TEST_REMOTE_NODE_ID,
          expiredLeaseOperation,
        ),
        true,
        'an expired lease defers to the (unready) heuristic',
      );

      owner.isNodeReadyForRouting = () => true;
      t.equal(
        owner.isPriorityRecoveryDrainOwnerUnavailable(
          TEST_REMOTE_NODE_ID,
          expiredLeaseOperation,
        ),
        false,
        'a routing-ready owner with a lapsed lease is available',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

// ---------------------------------------------------------------------------
// orphan-op-adopted-by-fenced-successor
// ---------------------------------------------------------------------------

test(
  'orphan adoption: expired-lease orphans on ordinary partitions are ' +
    'adoptable; live-lease rows stay fenced',
  async (t) => {
    initializeConfig();
    const expiredLeaseOperation = buildOrdinaryAddOperation({
      operationId: 'op-orphan-expired',
      ownerLeaseExpiresAt: LEASE_ANCHOR_MS,
    });
    const liveLeaseOperation = buildOrdinaryAddOperation({
      operationId: 'op-orphan-live',
      ownerLeaseExpiresAt: EXPIRED_LEASE_OBSERVED_AT_MS +
        REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
    });
    const unfencedOperation = buildOrdinaryAddOperation({
      operationId: 'op-orphan-unfenced',
    });

    t.equal(
      resolveOperationOwnerLeaseState(
        expiredLeaseOperation,
        EXPIRED_LEASE_OBSERVED_AT_MS,
      ).state,
      REPLICA_OPERATION_OWNER_LEASE_STATE.EXPIRED,
      'the expired lease is the typed EXPIRED state',
    );
    t.equal(
      resolveOperationOwnerLeaseAdoption(
        expiredLeaseOperation,
        TEST_NODE_ID,
        EXPIRED_LEASE_OBSERVED_AT_MS,
      ).adoption,
      REPLICA_OPERATION_OWNER_LEASE_ADOPTION.ADOPT_AS_FENCED_SUCCESSOR,
      'an expired-lease orphan is adoptable by the fenced successor',
    );
    t.equal(
      resolveOperationOwnerLeaseAdoption(
        liveLeaseOperation,
        TEST_NODE_ID,
        EXPIRED_LEASE_OBSERVED_AT_MS,
      ).adoption,
      REPLICA_OPERATION_OWNER_LEASE_ADOPTION.FENCED_BY_LIVE_REMOTE_LEASE,
      'a live remote lease fences the successor out',
    );
    t.equal(
      resolveOperationOwnerLeaseAdoption(
        unfencedOperation,
        TEST_NODE_ID,
        EXPIRED_LEASE_OBSERVED_AT_MS,
      ).adoption,
      REPLICA_OPERATION_OWNER_LEASE_ADOPTION.ADOPT_AS_FENCED_SUCCESSOR,
      'an unfenced row (no lease) is adoptable',
    );
  },
);

test(
  'orphan adoption: the fenced recovery sweep adopts an expired-lease ' +
    'orphan and skips live-lease rows',
  async (t) => {
    initializeConfig();
    const staleStartedAtMs = LEASE_ANCHOR_MS;
    const staleStepTimeoutMs = 1;
    const now = EXPIRED_LEASE_OBSERVED_AT_MS;
    const adoptableOperation = buildOrdinaryAddOperation({
      operationId: 'op-sweep-adopted',
      ownerLeaseExpiresAt: LEASE_ANCHOR_MS,
    });
    const fencedOperation = buildOrdinaryAddOperation({
      operationId: 'op-sweep-fenced',
      ownerLeaseExpiresAt: now + REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
    });
    const {coordinator} = createLeaseCoordinatorHarness();
    try {
      coordinator.incompleteOperationQueryEmptyBackoffMs = 0;
      coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
      coordinator.repository.queryCachedIncompleteOperations = () => [
        adoptableOperation,
        fencedOperation,
      ];
      coordinator.repository.getIncompleteOperationVisibilityObservation =
        async () => ({state: 'present', operations: []});
      coordinator.workflowOwner.resolveTimeoutCheckNowMs = () => now;
      coordinator.workflowOwner.getTimeoutForStep = () => staleStepTimeoutMs;

      const reconciled = [];
      coordinator.workflowOwner.reconcileOperationLifecycle =
        async (operation) => {
          reconciled.push(operation.operationId);
          return operation;
        };

      await coordinator.workflowOwner.reconcileOrphanedOperations();

      t.same(
        reconciled,
        [adoptableOperation.operationId],
        'the expired-lease orphan is adopted into the sweep and reconciled ' +
          'while the live-lease row stays fenced out',
      );
      t.ok(
        staleStartedAtMs < now,
        'the adopted orphan was stale past its step budget at sweep time',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

// ---------------------------------------------------------------------------
// shutdown-joins-in-flight
// ---------------------------------------------------------------------------

test(
  'shutdown join: the bounded await joins in-flight lanes and a wedged ' +
    'lane times out instead of pinning shutdown',
  async (t) => {
    initializeConfig();
    let laneRelease;
    const wedgedLane = new Promise((resolve) => {
      laneRelease = resolve;
    });
    const inFlightExecutionsByOwnerKey = new Map([
      ['op:lane-wedged', wedgedLane],
    ]);

    const timedOutJoin = await joinInFlightOperationOwnerLanes({
      inFlightExecutionsByOwnerKey,
      timeoutMs: 25,
    });
    t.equal(
      timedOutJoin.result,
      OPERATION_SHUTDOWN_JOIN_RESULT.TIMED_OUT,
      'a wedged lane hits the bounded join timeout (typed result, never ' +
        'raw null)',
    );
    t.equal(timedOutJoin.timedOut, true, 'the timeout is explicit');

    laneRelease();
    await wedgedLane;
    // The lane registry drops settled executions (the
    // DurableWorkflowCoordinator finally-arm); mirror that before re-joining.
    inFlightExecutionsByOwnerKey.clear();
    const settledJoin = await joinInFlightOperationOwnerLanes({
      inFlightExecutionsByOwnerKey,
      timeoutMs: SHUTDOWN_JOIN_TIMEOUT_MS,
    });
    t.equal(
      settledJoin.result,
      OPERATION_SHUTDOWN_JOIN_RESULT.JOINED,
      'a settled lane registry joins cleanly',
    );

    let slowLaneRelease;
    const slowLane = new Promise((resolve) => {
      slowLaneRelease = resolve;
    });
    const liveRegistry = new Map([['op:lane-slow', slowLane]]);
    // Mirror the coordinator lane: the registry entry drops once the
    // execution settles.
    void slowLane.finally(() => {
      liveRegistry.delete('op:lane-slow');
    });
    const joinPromise = joinInFlightOperationOwnerLanes({
      inFlightExecutionsByOwnerKey: liveRegistry,
      timeoutMs: SHUTDOWN_JOIN_TIMEOUT_MS,
    });
    let joinedEarly = false;
    void joinPromise.then(() => {
      joinedEarly = true;
    });
    await waitForImmediate();
    t.equal(
      joinedEarly,
      false,
      'the join still awaits the in-flight lane (no flag-set + map-clear)',
    );
    slowLaneRelease();
    const joinedResult = await joinPromise;
    t.equal(
      joinedResult.result,
      OPERATION_SHUTDOWN_JOIN_RESULT.JOINED,
      'the join resolves once the lane settles',
    );
  },
);

test(
  'shutdown join: coordinator shutdown bumps the ownership fence, awaits ' +
    'the in-flight lane, and the fenced lane stands down',
  async (t) => {
    initializeConfig();
    const {coordinator} = createLeaseCoordinatorHarness();
    let laneRelease;
    const lanePromise = new Promise((resolve) => {
      laneRelease = resolve;
    });
    const fenceEpochBefore =
      coordinator.workflowOwner.getOperationOwnershipFenceEpoch();
    const laneRegistry =
      coordinator.workflowOwner.operationWorkflowCoordinator
        .inFlightExecutionsByOwnerKey;
    laneRegistry.set('operation:op-lease-shutdown', lanePromise);
    // Mirror the coordinator lane: the registry entry drops once the
    // execution settles.
    void lanePromise.finally(() => {
      laneRegistry.delete('operation:op-lease-shutdown');
    });
    try {
      const shutdownPromise = coordinator.shutdown();
      let shutdownSettled = false;
      void shutdownPromise.then(() => {
        shutdownSettled = true;
      });
      for (
        let turn = 0;
        turn < SHUTDOWN_JOIN_OBSERVATION_TURN_BUDGET && !shutdownSettled;
        turn += 1
      ) {
        await waitForImmediate();
      }
      t.equal(
        shutdownSettled,
        false,
        'shutdown awaits the in-flight lane instead of returning past it',
      );
      t.equal(
        coordinator.workflowOwner.getOperationOwnershipFenceEpoch(),
        fenceEpochBefore + 1,
        'the ownership fence is bumped at the start of shutdown',
      );
      laneRelease();
      await shutdownPromise;
      t.equal(
        coordinator.isShuttingDown,
        true,
        'shutdown completes once the lane settles',
      );

      const retainedResult =
        await coordinator.workflowOwner.runRetainedOperationOwnerAction(
          'op-lease-shutdown',
          async () => ({success: true, ran: true}),
        );
      t.equal(
        retainedResult.skipped,
        true,
        'a lane continuation past the fence bump stands down instead of ' +
          'running unguarded',
      );
      t.equal(
        retainedResult.reason,
        'shutdown_in_progress',
        'the stand-down reason is the shutdown fence',
      );
    } finally {
      laneRelease();
      await coordinator.shutdown();
    }
  },
);

test(
  'shutdown join: the ownership fence epoch alone stands a lane down ' +
    '(red on lane-fence revert)',
  async (t) => {
    initializeConfig();
    const {coordinator} = createLeaseCoordinatorHarness();
    try {
      // Drive the fence path deterministically: a FOREIGN holder occupies
      // the operation's single-flight lane, so the retained runner's first
      // turn awaits the shared promise WITHOUT running its action factory;
      // the fence bump lands before the foreign holder releases, and the
      // epoch check — not the shutdown flag (still false) — must refuse the
      // next turn.
      const owner = coordinator.workflowOwner;
      const ownerKey =
        owner.getOperationOwnerSingleFlightKey('op-lease-fence-epoch');
      let foreignRelease;
      const foreignGate = new Promise((resolve) => {
        foreignRelease = resolve;
      });
      const foreignHold = owner.operationWorkflowRunExclusive(
        ownerKey,
        () => foreignGate,
      );

      let laneRan = false;
      const fencedPromise = owner.runRetainedOperationOwnerAction(
        'op-lease-fence-epoch',
        async () => {
          laneRan = true;
          return {success: true};
        },
      );
      // Let the retained runner reach its awaited first turn, then bump the
      // fence and release the foreign holder.
      await waitForImmediate();
      owner.bumpOperationOwnershipFenceEpoch();
      foreignRelease();
      await foreignHold;
      const resolvedResult = await fencedPromise;
      t.equal(
        laneRan,
        false,
        'the action factory never runs past the advanced fence',
      );
      t.equal(
        resolvedResult.skipped,
        true,
        'the lane stands down once the fence epoch advances mid-flight',
      );
      t.equal(
        resolvedResult.reason,
        'shutdown_in_progress',
        'the fence stand-down surfaces the shutdown reason',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);
