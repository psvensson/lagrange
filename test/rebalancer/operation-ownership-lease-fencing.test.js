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
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION,
  resolveOperationWorkflowOwnerTargetProgressReentryAction,
} from '../../src/rebalancer/operation-workflow-owner-priority-recovery-reentry.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED,
} from '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {
  WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
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

const {
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE,
  PRIORITY_RECOVERY_OPERATION_DRAIN_STATE,
} = OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;

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
    // SUPERSEDED (R09) by the owner decision of 2026-09-25, quest
    // replace-source-removal-owner (claim L1): this assertion previously
    // pinned `unavailable: true` for a live lease, contradicting the fence
    // contract (operation-owner-availability-policy.js module header) and
    // releasing REPLACEs whose owners were alive. A live lease held by the
    // recorded owner means the owner is AVAILABLE; that is what fences
    // remote settlement.
    t.equal(
      liveLeaseVerdict.unavailable,
      false,
      'the leased owner is available, so remote settlement stays fenced ' +
        'even though routing readiness reports it unready',
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
      // SUPERSEDED (R09) by the owner decision of 2026-09-25, quest
      // replace-source-removal-owner (claim L1): previously pinned `true`.
      // A live lease makes the recorded owner available, which is what
      // fences the drain's remote settlement.
      t.equal(
        owner.isPriorityRecoveryDrainOwnerUnavailable(
          TEST_REMOTE_NODE_ID,
          liveLeasedOperation,
        ),
        false,
        'a live lease keeps the drain owner available (fenced) even with ' +
          'the heuristic reporting unready',
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
// live-lease-verdict-polarity (owner decision 2026-09-25, quest
// replace-source-removal-owner, frozen claims L1/L2)
//
// L1: while the RECORDED owner holds a live lease, no remote actor treats it
// as unavailable: the drain does not release the REPLACE, the stale-FAIL
// does not settle it, the re-entry wake does not skip its owner.
// L2: an expired or absent lease keeps the routing-heuristic verdict, so the
// un-wedge path for a genuinely unavailable owner still works.
// The oracle is the module contract (live lease of the recorded owner =>
// available and fenced; otherwise the heuristic) over the lease module's own
// state enumeration.
// ---------------------------------------------------------------------------

const PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const TEST_SOURCE_NODE_ID = 'lease-node-source';
const WITNESS_OBSERVED_AT_MS = LIVE_LEASE_OBSERVED_AT_MS;
const ROUTING_READINESS_VALUES = Object.freeze([true, false]);
// The R-1c settlement: the unavailable owner's REPLACE failed with its
// source retained (the target is dead).
const R1C_SETTLEMENT_MESSAGE = 'replace_owner_unavailable_source_retained';
const DRAIN_SETTLEMENT = Object.freeze({
  COMPLETE: 'complete',
  FAIL: 'fail',
});
const WITNESS_COMMITTED_TRANSITION_OUTCOME = Object.freeze({
  committed: true,
  disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
});
// REPLACE phases crossed with the verdict: ACTIVE and STOPPING are
// release-eligible by step; SYNCING is release-eligible once the target is
// observed ACTIVE.
const WITNESS_REPLACE_PHASES = Object.freeze([
  Object.freeze({step: WORKFLOW_STEP.ACTIVE, targetStatus: null}),
  Object.freeze({step: WORKFLOW_STEP.STOPPING, targetStatus: null}),
  Object.freeze({
    step: WORKFLOW_STEP.SYNCING,
    targetStatus: ReplicaStatus.ACTIVE,
  }),
]);

// One lease fixture per lease-module state. A new lease state without a
// fixture fails the enumeration check below.
const LEASE_FIXTURE_BY_STATE = new Map([
  [
    REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE,
    Object.freeze({ownerLeaseExpiresAt: LIVE_LEASE_EXPIRES_AT_MS}),
  ],
  [
    REPLICA_OPERATION_OWNER_LEASE_STATE.EXPIRED,
    Object.freeze({ownerLeaseExpiresAt: LEASE_ANCHOR_MS}),
  ],
  [REPLICA_OPERATION_OWNER_LEASE_STATE.UNFENCED, Object.freeze({})],
]);

function leaseFencesRecordedOwner(leaseState) {
  return leaseState === REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE;
}

function expectRemoteOwnerUnavailable(leaseState, routingReady) {
  return !leaseFencesRecordedOwner(leaseState) && routingReady !== true;
}

function expectDrainOwnerVerdict(leaseState, routingReady) {
  if (leaseFencesRecordedOwner(leaseState)) {
    return {
      state: OPERATION_DRAIN_OWNER_AVAILABILITY.FENCED_BY_LIVE_LEASE,
      unavailable: false,
      heuristicConsulted: false,
    };
  }
  return {
    state: routingReady ?
      OPERATION_DRAIN_OWNER_AVAILABILITY.HEURISTIC_AVAILABLE :
      OPERATION_DRAIN_OWNER_AVAILABILITY.HEURISTIC_UNAVAILABLE,
    unavailable: routingReady !== true,
    heuristicConsulted: true,
  };
}

function* enumerateLeaseCells() {
  for (const leaseState of Object.values(REPLICA_OPERATION_OWNER_LEASE_STATE)) {
    for (const routingReady of ROUTING_READINESS_VALUES) {
      yield {leaseState, routingReady};
    }
  }
}

function describeCell(cell, phase = null) {
  return `lease=${cell.leaseState} routingReady=${cell.routingReady}` +
    (phase ? ` step=${phase.step}` : '');
}

function resolveVerdictForCell(cell, operationOverrides = {}) {
  let heuristicCalls = 0;
  const verdict = resolveOperationDrainOwnerAvailability({
    ownerNodeId: TEST_REMOTE_NODE_ID,
    nodeId: TEST_NODE_ID,
    operation: buildOrdinaryAddOperation({
      ...LEASE_FIXTURE_BY_STATE.get(cell.leaseState),
      ...operationOverrides,
    }),
    nowMs: WITNESS_OBSERVED_AT_MS,
    isOwnerRoutingReady: () => {
      heuristicCalls += 1;
      return cell.routingReady;
    },
  });
  return {verdict, heuristicCalls};
}

test(
  'live-lease verdict polarity: the verdict table over lease state x ' +
    'routing heuristic follows the fence contract',
  async (t) => {
    for (const leaseState of Object.values(
      REPLICA_OPERATION_OWNER_LEASE_STATE,
    )) {
      const fixture = LEASE_FIXTURE_BY_STATE.get(leaseState);
      t.ok(fixture, `lease state ${leaseState} has a witness fixture`);
      t.equal(
        resolveOperationOwnerLeaseState(
          buildOrdinaryAddOperation(fixture),
          WITNESS_OBSERVED_AT_MS,
        ).state,
        leaseState,
        `the ${leaseState} fixture is that state per the lease module`,
      );
    }
    for (const cell of enumerateLeaseCells()) {
      const {verdict, heuristicCalls} = resolveVerdictForCell(cell);
      const expected = expectDrainOwnerVerdict(
        cell.leaseState,
        cell.routingReady,
      );
      t.equal(verdict.state, expected.state, `state: ${describeCell(cell)}`);
      t.equal(
        verdict.unavailable,
        expected.unavailable,
        `unavailable: ${describeCell(cell)}`,
      );
      t.equal(
        heuristicCalls > 0,
        expected.heuristicConsulted,
        'heuristic consulted only without a fencing lease: ' +
          describeCell(cell),
      );
    }
  },
);

test(
  'live-lease verdict polarity: only the RECORDED owner\'s live lease ' +
    'fences; a live lease attributed to another node defers to the heuristic',
  async (t) => {
    for (const routingReady of ROUTING_READINESS_VALUES) {
      const cell = {
        leaseState: REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE,
        routingReady,
      };
      const recorded = resolveVerdictForCell(cell, {
        ownerNodeId: TEST_REMOTE_NODE_ID,
      });
      t.equal(
        recorded.verdict.state,
        OPERATION_DRAIN_OWNER_AVAILABILITY.FENCED_BY_LIVE_LEASE,
        `a live lease held by the recorded owner fences (ready=${routingReady})`,
      );
      t.equal(recorded.verdict.unavailable, false);

      const foreign = resolveVerdictForCell(cell, {
        ownerNodeId: TEST_TARGET_NODE_ID,
      });
      const expected = expectDrainOwnerVerdict(
        REPLICA_OPERATION_OWNER_LEASE_STATE.EXPIRED,
        routingReady,
      );
      t.equal(
        foreign.verdict.state,
        expected.state,
        `a foreign live lease is not the recorded owner's (ready=${routingReady})`,
      );
      t.equal(foreign.verdict.unavailable, expected.unavailable);
      t.equal(foreign.heuristicCalls, 1, 'the heuristic decides instead');
      t.equal(
        foreign.verdict.lease.state,
        REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE,
        'the verdict still reports the observed lease',
      );
    }
  },
);

function buildPriorityReplaceOperation(phase, leaseState) {
  const operation = createOperation({
    operationId: `op-lease-replace-${phase.step}-${leaseState}`,
    type: OperationType.REPLACE,
    partitionId: PRIORITY_PARTITION_ID,
    replicaId: `${PRIORITY_PARTITION_ID}-r7`,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_REMOTE_NODE_ID,
  });
  operation.entityType = SERVICE_TYPE.PARTITION;
  operation.entityId = PRIORITY_PARTITION_ID;
  operation.workflowStep = phase.step;
  operation.status = WORKFLOW_STEP_TO_STATUS[phase.step];
  operation.createdAt = LEASE_ANCHOR_MS - 1_000;
  operation.updatedAt = LEASE_ANCHOR_MS;
  operation.stepsHistory = [
    {step: WORKFLOW_STEP.PENDING, timestamp: LEASE_ANCHOR_MS - 1_000},
    {step: phase.step, timestamp: LEASE_ANCHOR_MS},
  ];
  return Object.assign(operation, LEASE_FIXTURE_BY_STATE.get(leaseState));
}

// Arms the upstream drain evidence (completion, source snapshot, step age,
// target observation) that is NOT a verdict input, and records every
// settlement. The verdict itself runs unstubbed; only its routing probe is
// set per cell.
function armDrainOwner(owner, {
  phase, routingReady, sourceState, stepStale, targetDead = false,
}) {
  const settlements = [];
  const failMessages = [];
  owner.timeSource = {now: () => WITNESS_OBSERVED_AT_MS};
  owner.isNodeReadyForRouting = () => routingReady;
  owner.readAvailablePriorityRecoveryPlanningSnapshot = async () => null;
  owner.buildPriorityRecoveryAssessmentContextForOperation = () => null;
  owner.buildPriorityRecoveryCompletionForOperation = () =>
    Object.freeze({state: PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED});
  owner.resolvePriorityRecoveryRemoteSupersededTargetDrainError = () => null;
  owner.buildPriorityRecoveryOperationDrainSourceSnapshot = async () =>
    Object.freeze({
      state: sourceState,
      sourceReplicaId: null,
      observationState: null,
      lifecycleStatus: null,
    });
  owner.isPriorityRecoveryOperationDrainStepStale = () => stepStale;
  owner.repository.getObservedReplicaStatusFromCache = () =>
    targetDead ? ReplicaStatus.FAILED : phase.targetStatus;
  owner.completeOperation = async () => {
    settlements.push(DRAIN_SETTLEMENT.COMPLETE);
    return WITNESS_COMMITTED_TRANSITION_OUTCOME;
  };
  owner.failOperation = async (_operation, message) => {
    settlements.push(DRAIN_SETTLEMENT.FAIL);
    failMessages.push(message);
    return WITNESS_COMMITTED_TRANSITION_OUTCOME;
  };
  return {settlements, failMessages};
}

async function sweepDrainCell(cell, phase, drainEvidence) {
  initializeConfig();
  const {coordinator} = createLeaseCoordinatorHarness();
  try {
    const owner = coordinator.workflowOwner;
    const operation = buildPriorityReplaceOperation(phase, cell.leaseState);
    const {settlements, failMessages} = armDrainOwner(owner, {
      phase,
      routingReady: cell.routingReady,
      ...drainEvidence,
    });
    const recordedOwner = owner.repository.resolveOperationOwnerNodeId(
      operation,
    );
    const snapshot =
      await owner.buildPriorityRecoveryOperationDrainSnapshot(operation);
    await owner.reconcilePriorityRecoveryOperationDrain(operation, snapshot);
    return {recordedOwner, snapshot, settlements, failMessages};
  } finally {
    await coordinator.shutdown();
  }
}

// SUPERSEDED (R09) by the owner decisions of 2026-09-25 (approved REPLACE
// design R-1b/R-1c/A6, owner decision D2; amendment-1 step 3 and §4), quest
// replace-source-removal-owner. These two callers were witnessed with the L2
// "un-wedge" release and a step-age stale-FAIL of a REPLACE whose lease had
// lapsed and whose owner read unready. Under the completed design:
//  - R-1b: the drain never releases (closes) a partition REPLACE, whatever
//    the lease and the heuristic say; it hands the REPLACE back to its owner;
//  - A6/S9: a REPLACE at ACTIVE or STOPPING is never stale by step age
//    (earlier steps keep the existing staleness policy);
//  - R-1c: at ACTIVE the only non-owner FAIL has the owner unavailable (the
//    unchanged lease verdict) AND the target replica marked FAILED by the
//    failure detector;
//  - D2: after the intent (STOPPING) no remote FAIL at all.
// L1 (a live lease never releases, settles or skips) holds in every cell.
test(
  'live-lease verdict polarity, caller 1 (drain release): R-1b - the drain ' +
    'never releases a partition REPLACE in any lease or routing cell',
  async (t) => {
    for (const phase of WITNESS_REPLACE_PHASES) {
      for (const cell of enumerateLeaseCells()) {
        const outcome = await sweepDrainCell(cell, phase, {
          sourceState:
            PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE.REMOVAL_REQUIRED,
          stepStale: false,
        });
        const label = describeCell(cell, phase);
        t.equal(outcome.recordedOwner, TEST_REMOTE_NODE_ID,
          `the leased target is the recorded owner: ${label}`);
        t.not(outcome.snapshot.state,
          PRIORITY_RECOVERY_OPERATION_DRAIN_STATE.OWNER_UNAVAILABLE_RELEASED,
          `never released: ${label}`);
        t.same(outcome.settlements, [], `no settlement: ${label}`);
      }
    }
  },
);

test(
  'live-lease verdict polarity, caller 2 (stale-FAIL remote settle): R-1c - ' +
    'an ACTIVE REPLACE is failed remotely only with an unavailable owner and ' +
    'a dead target; a STOPPING one never; step age alone fails neither',
  async (t) => {
    for (const targetDead of [false, true]) {
      for (const phase of WITNESS_REPLACE_PHASES) {
        for (const cell of enumerateLeaseCells()) {
          const outcome = await sweepDrainCell(cell, phase, {
            sourceState:
              PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE
                .EVIDENCE_UNAVAILABLE,
            stepStale: true,
            targetDead,
          });
          const label = `${describeCell(cell, phase)} targetDead=${targetDead}`;
          // STOPPING (D2): never. ACTIVE (S9/A6): only R-1c, a dead target.
          // SYNCING (pre-ACTIVE): the existing step-stale policy still applies.
          const settledStep = phase.step === WORKFLOW_STEP.SYNCING ||
            (phase.step === WORKFLOW_STEP.ACTIVE && targetDead);
          const settled = settledStep &&
            expectRemoteOwnerUnavailable(cell.leaseState, cell.routingReady);
          t.equal(
            outcome.snapshot.ownerState ===
              PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE
                .REMOTE_SETTLE_ALLOWED,
            settled,
            `remote settle permission: ${label}`,
          );
          t.same(
            outcome.settlements,
            settled ? [DRAIN_SETTLEMENT.FAIL] : [],
            `settlements: ${label}`,
          );
          if (settled && phase.step === WORKFLOW_STEP.ACTIVE) {
            t.same(outcome.failMessages,
              [R1C_SETTLEMENT_MESSAGE],
              `R-1c names its settlement (source retained): ${label}`);
          }
        }
      }
    }
  },
);

function buildSourceRemovalReentrySnapshot() {
  return Object.freeze({
    actuation: Object.freeze({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
    }),
    progress: Object.freeze({
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    }),
  });
}

test(
  'live-lease verdict polarity, caller 3 (re-entry wake): a live owner ' +
    'lease never skips its owner as no longer repair-eligible; an ' +
    'expired/absent lease with an unready owner still skips it (L2)',
  async (t) => {
    for (const phase of WITNESS_REPLACE_PHASES) {
      for (const cell of enumerateLeaseCells()) {
        initializeConfig();
        const {coordinator} = createLeaseCoordinatorHarness();
        try {
          const owner = coordinator.workflowOwner;
          owner.timeSource = {now: () => WITNESS_OBSERVED_AT_MS};
          owner.isNodeReadyForRouting = () => cell.routingReady;
          const action =
            resolveOperationWorkflowOwnerTargetProgressReentryAction(
              owner,
              buildSourceRemovalReentrySnapshot(),
              buildPriorityReplaceOperation(phase, cell.leaseState),
            );
          const skipped = expectRemoteOwnerUnavailable(
            cell.leaseState,
            cell.routingReady,
          );
          t.equal(
            action,
            skipped ?
              OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION.SKIP :
              OPERATION_WORKFLOW_OWNER_TARGET_PROGRESS_REENTRY_ACTION
                .WAKE_REMOTE_OWNER,
            `re-entry action: ${describeCell(cell, phase)}`,
          );
        } finally {
          await coordinator.shutdown();
        }
      }
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
