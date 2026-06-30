import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';

const PRIORITY_RECOVERY_OPERATION_OWNER_TEST_STATE =
  'priority_recovery_snapshot_owner_outcome';
const PRIORITY_RECOVERY_OPERATION_OWNER_TEST_CORRELATION_KEY =
  'priority_recovery_snapshot_owner_correlation';
const PRIORITY_RECOVERY_OPERATION_OWNER_TEST_SOURCE_REVISION =
  'priority_recovery_snapshot_owner_revision';

function buildPriorityRecoverySnapshotOperationOwnerOutcome(overrides = {}) {
  const outcome =
    overrides.outcome ||
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS;
  return Object.freeze({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    state: PRIORITY_RECOVERY_OPERATION_OWNER_TEST_STATE,
    outcome,
    nextRequiredAction: outcome,
    effectCommand: OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
    reasons: Object.freeze([]),
    correlationKey: PRIORITY_RECOVERY_OPERATION_OWNER_TEST_CORRELATION_KEY,
    sourceRevision: PRIORITY_RECOVERY_OPERATION_OWNER_TEST_SOURCE_REVISION,
    ...overrides,
  });
}

function findPriorityRecoverySnapshotByOperation(
  decisionSnapshots,
  partitionId,
  operationId,
) {
  const snapshots = Array.isArray(decisionSnapshots?.snapshots) ?
    decisionSnapshots.snapshots :
    [];
  return snapshots.find((entry) =>
    entry.partitionId === partitionId && entry.operationId === operationId,
  );
}

function assertPriorityRecoveryMixedOpenDispatchSnapshot(
  t,
  snapshot,
  expected,
) {
  const conditions = snapshot?.conditions || {};
  const actuation = snapshot?.actuation || {};
  const progress = snapshot?.progress || {};
  t.equal(
    conditions.latestOperationWorkflowStep,
    expected.workflowStep,
    'mixed terminal siblings should not hide the open PENDING workflow step',
  );
  t.equal(
    conditions.latestOperationStatus,
    expected.status,
    'mixed terminal siblings should not hide the open PENDING status',
  );
  t.match(
    actuation,
    {
      owner: expected.workflowOwner,
      state: expected.persistedNotDispatchedState,
      workflowProgressPhaseId: expected.dispatchPendingPhase,
      latestOperationId: expected.operationId,
      lastProgressAtMs: expected.lastProgressAtMs,
    },
    'mixed terminal siblings should keep actuation on the open dispatch-pending row',
  );
  t.match(
    progress,
    {
      currentOwner: expected.workflowOwner,
      nextRequiredAction: expected.advanceExistingOperationAction,
      blockingBoundary: expected.workflowBoundary,
      waitMode: expected.eventDrivenWait,
      workflowProgressPhaseId: expected.dispatchPendingPhase,
      lastProgressAtMs: expected.lastProgressAtMs,
    },
    'mixed terminal siblings should re-enter owner progress for the open dispatch-pending row',
  );
  t.equal(
    snapshot?.operationOwnerObservation?.outcome,
    expected.ownerOutcome,
    'owner observation should target the open dispatch-pending operation',
  );
  t.equal(
    snapshot?.coordinator?.operation?.operationId,
    expected.operationId,
    'operation-specific snapshots should keep the pending row as coordinator evidence',
  );
}

function assertPriorityRecoveryMixedTerminalSiblingSnapshot(
  t,
  snapshot,
  expected,
) {
  const conditions = snapshot?.conditions || {};
  const actuation = snapshot?.actuation || {};
  const progress = snapshot?.progress || {};
  t.equal(
    conditions.latestOperationWorkflowStep,
    expected.workflowStep,
    'terminal sibling snapshots should keep the terminal workflow step',
  );
  t.equal(
    conditions.latestOperationStatus,
    expected.status,
    'terminal sibling snapshots should keep the terminal status',
  );
  t.match(
    actuation,
    {
      owner: expected.rebalancerOwner,
      state: expected.actionRequiredState,
      latestOperationId: expected.operationId,
    },
    'terminal sibling snapshots should not inherit pending-row actuation',
  );
  t.match(
    progress,
    {
      contractState: expected.pendingContractState,
      nextAction: expected.waitNextAction,
      currentOwner: expected.rebalancerOwner,
      nextRequiredAction: expected.createOperationAction,
      blockingBoundary: expected.schedulingBoundary,
      waitMode: expected.eventDrivenWait,
    },
    'terminal sibling snapshots should not inherit pending-row workflow progress',
  );
  t.notOk(
    snapshot?.operationOwnerObservation,
    'terminal sibling snapshots should not retain a pending owner observation',
  );
  t.equal(
    snapshot?.coordinator?.operation?.operationId,
    expected.operationId,
    'terminal sibling snapshots should keep the terminal row as coordinator evidence',
  );
}

export function registerPriorityRecoverySnapshotSupplementalDispatchPendingOwnerProgressTests(
  context,
) {
  const {
    buildPriorityRecoveryDecisionSnapshots,
    normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
    OPERATION_WORKFLOW_OUTCOME_VALUES,
    OPERATION_WORKFLOW_REASON_CODE_VALUES,
    PRIORITY_RECOVERY_ACTIVE_SOURCE_REMOVAL_AGE_MS,
    PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
    PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
    PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
    PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
    PRIORITY_RECOVERY_NODE_ID_A,
    PRIORITY_RECOVERY_NODE_ID_B,
    PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
    PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
    PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
    PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
    PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
    PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
    PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_RECONCILE_STALE_OPERATION,
    PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW_TIMEOUT,
    PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
    PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
    PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
    PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
    PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
    PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
    PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
    PRIORITY_RECOVERY_PROGRESS_WAIT_TIMEOUT_RECONCILE_DUE,
    PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
    PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
    PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
    PRIORITY_RECOVERY_STATUS_ACTIVE,
    PRIORITY_RECOVERY_STATUS_PENDING,
    PRIORITY_RECOVERY_STATUS_REMOVED,
    PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
    PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
    PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
    SQL_TRANSACTION_PRIORITY_PARTITION_ID,
    test,
  } = context;

  test(
    'normalizePriorityRecoveryDispatchPendingDecisionSnapshot advances ' +
      'persisted dispatch-pending waits',
    async (t) => {
      const snapshot = Object.freeze({
        partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
        blockerReasons: Object.freeze([]),
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        actuation: Object.freeze({
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          lastProgressAtMs: PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
        }),
        progress: Object.freeze({
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          lastProgressAtMs: PRIORITY_RECOVERY_PENDING_OPERATION_UPDATED_AT_MS,
        }),
      });

      const normalizedSnapshot =
        normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
          snapshot,
          buildPriorityRecoverySnapshotOperationOwnerOutcome({
            outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
            effectCommand:
              OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
                .DISPATCH_LOCAL_OWNER_COMMAND,
            reasons: Object.freeze([
              OPERATION_WORKFLOW_REASON_CODE_VALUES
                .LOCAL_OWNER_AUTHORITATIVE,
              OPERATION_WORKFLOW_REASON_CODE_VALUES.DISPATCH_NOT_OBSERVED,
            ]),
          }),
        );

      t.equal(
        normalizedSnapshot?.progress?.nextRequiredAction,
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        'persisted dispatch-pending waits should normalize to owner advancement',
      );
      t.equal(
        normalizedSnapshot?.progress?.blockingBoundary,
        PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        'persisted dispatch-pending waits should stay on workflow progress',
      );
      t.equal(
        normalizedSnapshot?.progress?.waitMode,
        PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        'persisted dispatch-pending waits should preserve the event-driven wait mode',
      );
      t.equal(
        normalizedSnapshot?.actuation?.state,
        PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
        'persisted dispatch-pending waits should preserve persisted-not-dispatched actuation',
      );
    },
  );

  test(
    'normalizePriorityRecoveryDispatchPendingDecisionSnapshot rewrites ' +
      'dispatch-pending timeout snapshots back to owner advancement',
    async (t) => {
      const snapshot = Object.freeze({
        partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
        blockerReasons: Object.freeze([
          PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
        ]),
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
        actuation: Object.freeze({
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          lastProgressAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        }),
        progress: Object.freeze({
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_RECONCILE_STALE_OPERATION,
          blockingBoundary:
            PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW_TIMEOUT,
          waitMode:
            PRIORITY_RECOVERY_PROGRESS_WAIT_TIMEOUT_RECONCILE_DUE,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          lastProgressAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        }),
        coordinator: Object.freeze({
          operation: Object.freeze({
            workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
          }),
        }),
      });

      const normalizedSnapshot =
        normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
          snapshot,
          buildPriorityRecoverySnapshotOperationOwnerOutcome({
            outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
            effectCommand:
              OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
                .DISPATCH_LOCAL_OWNER_COMMAND,
            reasons: Object.freeze([
              OPERATION_WORKFLOW_REASON_CODE_VALUES
                .LOCAL_OWNER_AUTHORITATIVE,
              OPERATION_WORKFLOW_REASON_CODE_VALUES.DISPATCH_NOT_OBSERVED,
            ]),
          }),
        );
      const {actuation, progress} = normalizedSnapshot;

      t.same(
        normalizedSnapshot.blockerReasons,
        [],
        'dispatch-pending timeout normalization should clear stale timeout blocker reasons',
      );
      t.equal(
        normalizedSnapshot.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        'dispatch-pending timeout normalization should restore the in-flight semantic state',
      );
      t.equal(
        actuation.state,
        PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
        'dispatch-pending timeout normalization should restore persisted-not-dispatched actuation',
      );
      t.equal(
        progress.nextRequiredAction,
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        'dispatch-pending timeout normalization should advance the existing operation',
      );
      t.equal(
        progress.nextAction,
        PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        'dispatch-pending timeout normalization should wait instead of retrying timeout reconcile',
      );
      t.equal(
        progress.blockingBoundary,
        PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        'dispatch-pending timeout normalization should return to workflow-progress ownership',
      );
      t.equal(
        progress.waitMode,
        PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        'dispatch-pending timeout normalization should restore the event-driven wait mode',
      );
    },
  );

  test(
    'normalizePriorityRecoveryDispatchPendingDecisionSnapshot re-enters ' +
      'canonical owner progress from stale timeout outcomes',
    async (t) => {
      const snapshot = Object.freeze({
        partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
        blockerReasons: Object.freeze([
          PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS,
        ]),
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
        actuation: Object.freeze({
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_TRANSITION_DEFERRED,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          lastProgressAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        }),
        progress: Object.freeze({
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_RETRY,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_RECONCILE_STALE_OPERATION,
          blockingBoundary:
            PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW_TIMEOUT,
          waitMode:
            PRIORITY_RECOVERY_PROGRESS_WAIT_TIMEOUT_RECONCILE_DUE,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          lastProgressAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        }),
      });

      const normalizedSnapshot =
        normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
          snapshot,
          buildPriorityRecoverySnapshotOperationOwnerOutcome({
            outcome:
              OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
            nextRequiredAction:
              OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
            effectCommand:
              OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
                .RECONCILE_STALE_PROGRESS_COMMAND,
            reasons: Object.freeze([
              OPERATION_WORKFLOW_REASON_CODE_VALUES.TIMEOUT_BUDGET_EXPIRED,
              OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_HISTORY_STALE,
            ]),
          }),
        );

      t.same(
        normalizedSnapshot?.blockerReasons,
        [],
        'canonical stale timeout owner outcomes should clear timeout blockers',
      );
      t.equal(
        normalizedSnapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        'canonical stale timeout owner outcomes should re-enter in-flight recovery',
      );
      t.equal(
        normalizedSnapshot?.actuation?.state,
        PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
        'canonical stale timeout owner outcomes should restore dispatch actuation',
      );
      t.equal(
        normalizedSnapshot?.progress?.nextRequiredAction,
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        'canonical stale timeout owner outcomes should advance existing operation',
      );
      t.equal(
        normalizedSnapshot?.progress?.blockingBoundary,
        PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        'canonical stale timeout owner outcomes should leave workflow_timeout',
      );
      t.equal(
        normalizedSnapshot?.operationOwnerObservation?.requestedOwnerAction,
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        'owner observation should expose the re-entry action',
      );
    },
  );

  test(
    'normalizePriorityRecoveryDispatchPendingDecisionSnapshot records ' +
      'no owner observation when owner outcome is absent',
    async (t) => {
      const snapshot = Object.freeze({
        partitionId: PRIORITY_RECOVERY_SQL_WRITE_OPERATIONS_PARTITION_ID,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
        blockerReasons: Object.freeze([]),
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        actuation: Object.freeze({
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          lastProgressAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
          timeoutReconcileDue: false,
        }),
        progress: Object.freeze({
          contractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
          nextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
          lastProgressAtMs: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        }),
      });

      const normalizedSnapshot =
        normalizePriorityRecoveryDispatchPendingDecisionSnapshot(snapshot);

      t.notOk(
        normalizedSnapshot?.operationOwnerObservation,
        'dispatch-pending diagnostics must not synthesize owner evidence',
      );
      t.equal(
        normalizedSnapshot?.actuation?.state,
        PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
        'snapshot actuation should remain unchanged without owner input',
      );
      t.equal(
        normalizedSnapshot?.progress?.nextRequiredAction,
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        'snapshot progress should remain unchanged without owner input',
      );
    },
  );

  test(
    'buildPriorityRecoveryDecisionSnapshots attaches owner observation ' +
      'after appending persisted PENDING operation-specific snapshots',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount:
                PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: 1,
              spreadGap: 2,
            }],
            missingPartitionIds: [
              SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            ],
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            locallyEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [{
          operation_id: PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
          partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
          entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
          operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
          status: PRIORITY_RECOVERY_STATUS_PENDING,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
          source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
          target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
          replica_id: PRIORITY_RECOVERY_REPLICA_ID_TARGET_SERVICE_PROGRESS,
          created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
          updated_at: PRIORITY_RECOVERY_STALE_OPERATION_PROGRESS_AT_MS,
        }],
        serviceRows: [],
      });

      const appendedSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID &&
        entry.operationId ===
          PRIORITY_RECOVERY_OPERATION_ID_PENDING_REPLACE_STALE,
      );

      t.equal(
        appendedSnapshot?.operationOwnerObservation?.outcome,
        OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
        'appended persisted PENDING snapshots should observe owner advancement',
      );
      t.equal(
        appendedSnapshot?.operationOwnerObservation?.effectCommand,
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .ADVANCE_EXISTING_OPERATION_COMMAND,
        'diagnostic owner advancement should remain an unexecuted command',
      );
      t.equal(
        appendedSnapshot?.operationOwnerObservation?.requestedOwnerAction,
        PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        'diagnostic owner observation should request existing operation advance',
      );
      t.same(
        decisionSnapshots.blockerPartitionIdsByReason[
          PRIORITY_RECOVERY_BLOCKER_REASON_OPERATION_NO_TRANSITIONS
        ],
        [],
        'summary blockers should clear the observed no-transition evidence',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION
        ],
        [],
        'summary semantic state should not retain the pre-append partition state',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED
        ],
        [],
        'summary semantic state should clear the stalled owner boundary',
      );
      t.same(
        decisionSnapshots.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT
        ],
        [SQL_TRANSACTION_PRIORITY_PARTITION_ID],
        'summary semantic state should retain the active owner boundary',
      );
      t.notOk(
        decisionSnapshots.unresolvedSemanticStateIds.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        ),
        'closure inputs should not retain stale needs-operation state',
      );
      t.notOk(
        decisionSnapshots.unresolvedSemanticStateIds.includes(
          PRIORITY_RECOVERY_SEMANTIC_STATE_OPERATION_STALLED,
        ),
        'closure inputs should clear the observed stalled state',
      );
    },
  );

  test(
    'buildPriorityRecoveryDecisionSnapshots keeps mixed terminal sibling ' +
      'evidence on the still-open dispatch-pending operation',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
        stepTimeoutMsByWorkflowStep: {
          [PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING]:
            PRIORITY_RECOVERY_PENDING_TIMEOUT_MS,
        },
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount:
                PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: 1,
              spreadGap: 2,
            }],
            missingPartitionIds: [
              SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            ],
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            locallyEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [
          {
            operation_id: PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
            partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
            operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_PENDING,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
            created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
            updated_at: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
          },
          {
            operation_id: PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
            partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
            operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_REMOVED,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
            created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
            updated_at: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
            completed_at: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
          },
        ],
        serviceRows: [],
      });

      const appendedSnapshot = findPriorityRecoverySnapshotByOperation(
        decisionSnapshots,
        SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
      );

      assertPriorityRecoveryMixedOpenDispatchSnapshot(t, appendedSnapshot, {
        advanceExistingOperationAction:
          PRIORITY_RECOVERY_PROGRESS_ACTION_ADVANCE_EXISTING_OPERATION,
        dispatchPendingPhase: PRIORITY_RECOVERY_PROGRESS_PHASE_DISPATCH_PENDING,
        eventDrivenWait: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        lastProgressAtMs: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
        ownerOutcome:
          OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
        persistedNotDispatchedState:
          PRIORITY_RECOVERY_ACTUATION_STATE_PERSISTED_NOT_DISPATCHED,
        status: PRIORITY_RECOVERY_STATUS_PENDING,
        workflowBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
        workflowOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
        workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_PENDING,
      });

      const terminalSnapshot = findPriorityRecoverySnapshotByOperation(
        decisionSnapshots,
        SQL_TRANSACTION_PRIORITY_PARTITION_ID,
        PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
      );

      assertPriorityRecoveryMixedTerminalSiblingSnapshot(t, terminalSnapshot, {
        actionRequiredState: PRIORITY_RECOVERY_ACTUATION_STATE_ACTION_REQUIRED,
        createOperationAction: PRIORITY_RECOVERY_PROGRESS_ACTION_CREATE_OPERATION,
        eventDrivenWait: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
        operationId: PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
        pendingContractState: PRIORITY_RECOVERY_PROGRESS_CONTRACT_STATE_PENDING,
        rebalancerOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_REBALANCER,
        schedulingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_SCHEDULING,
        status: PRIORITY_RECOVERY_STATUS_REMOVED,
        waitNextAction: PRIORITY_RECOVERY_PROGRESS_NEXT_ACTION_WAIT,
        workflowStep: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
      });
    },
  );

  test(
    'buildPriorityRecoveryDecisionSnapshots keeps mixed terminal sibling ' +
      'evidence on the still-open source-removal operation',
    async (t) => {
      const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
        capturedAt: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
        publicationConvergence: {
          publicationEpoch: PRIORITY_RECOVERY_SAMPLE_PUBLICATION_EPOCH,
          publicationStatus: PRIORITY_RECOVERY_PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: [
            PRIORITY_RECOVERY_NODE_ID_A,
            PRIORITY_RECOVERY_NODE_ID_B,
          ],
          pendingAckNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
              requiredDistinctNodeCount:
                PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: 1,
              spreadGap: 2,
            }],
            missingPartitionIds: [
              SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            ],
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          },
          membershipLifecycleSummary: {
            projectedServingNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
            locallyEligibleNodeIds: [
              PRIORITY_RECOVERY_NODE_ID_A,
              PRIORITY_RECOVERY_NODE_ID_B,
            ],
          },
        },
        readinessByNodeId: {},
        workflowAdmissionsByWorkflowId: {},
        replicaOperationRows: [
          {
            operation_id: PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
            partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
            operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_ACTIVE,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
            created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
            updated_at: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
            age_ms: PRIORITY_RECOVERY_ACTIVE_SOURCE_REMOVAL_AGE_MS,
          },
          {
            operation_id: PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE,
            partition_id: SQL_TRANSACTION_PRIORITY_PARTITION_ID,
            entity_type: PRIORITY_RECOVERY_ENTITY_TYPE_PARTITION,
            operation_type: PRIORITY_RECOVERY_OPERATION_TYPE_REPLACE,
            status: PRIORITY_RECOVERY_STATUS_REMOVED,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
            source_node_id: PRIORITY_RECOVERY_NODE_ID_A,
            target_node_id: PRIORITY_RECOVERY_NODE_ID_B,
            created_at: PRIORITY_RECOVERY_OPERATION_CREATED_AT_MS,
            updated_at: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
            completed_at: PRIORITY_RECOVERY_TARGET_SERVICE_CAPTURED_AT_MS,
          },
        ],
        replicaOperations: {
          operationTimelineById: {
            [PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT]: [
              {
                step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
                status: PRIORITY_RECOVERY_STATUS_ACTIVE,
                inFlight: true,
              },
            ],
            [PRIORITY_RECOVERY_OPERATION_ID_TERMINAL_REPLACE]: [
              {
                step: PRIORITY_RECOVERY_WORKFLOW_STEP_REMOVED,
                status: PRIORITY_RECOVERY_STATUS_REMOVED,
                inFlight: false,
              },
            ],
          },
        },
        serviceRows: [],
      });

      const appendedSnapshot = decisionSnapshots.snapshots.find((entry) =>
        entry.partitionId === SQL_TRANSACTION_PRIORITY_PARTITION_ID &&
        entry.operationId === PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
      );

      t.equal(
        appendedSnapshot?.conditions?.latestOperationWorkflowStep,
        PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
        'mixed terminal siblings should not hide the open ACTIVE workflow step',
      );
      t.equal(
        appendedSnapshot?.conditions?.latestOperationStatus,
        PRIORITY_RECOVERY_STATUS_ACTIVE,
        'mixed terminal siblings should not hide the open active status',
      );
      t.match(
        appendedSnapshot?.actuation,
        {
          owner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          state: PRIORITY_RECOVERY_ACTUATION_STATE_DISPATCHED_WAITING_PROGRESS,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          latestOperationId: PRIORITY_RECOVERY_OPERATION_ID_PENDING_OWNER_WAIT,
          lastProgressAtMs: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
        },
        'mixed terminal siblings should keep actuation on the open source-removal row',
      );
      t.match(
        appendedSnapshot?.progress,
        {
          currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER_WORKFLOW,
          nextRequiredAction:
            PRIORITY_RECOVERY_PROGRESS_ACTION_WAIT_FOR_PROGRESS,
          blockingBoundary: PRIORITY_RECOVERY_PROGRESS_BOUNDARY_WORKFLOW,
          waitMode: PRIORITY_RECOVERY_PROGRESS_WAIT_EVENT_DRIVEN,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_PROGRESS_PHASE_SOURCE_REMOVAL,
          lastProgressAtMs: PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_AT_MS,
        },
        'mixed terminal siblings should keep owner progress on the open source-removal row',
      );
    },
  );
}
